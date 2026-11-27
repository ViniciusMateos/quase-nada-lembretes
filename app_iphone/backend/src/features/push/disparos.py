"""
Push na HORA do lembrete, pro que o iPhone não agendou.

Quem toca o lembrete é a notificação LOCAL do iPhone, agendada a cada /sync. Um
lembrete criado fora do app (painel web) só entra lá quando o app sincroniza —
até lá, não tocava. Agora o app conta ao backend o que agendou
(POST /reminders/scheduled) e, a cada tick do scheduler, o backend manda push
das execuções que venceram e NÃO estão nessa lista. O que está na lista o iPhone
toca sozinho: mandar push também tocaria em dobro.

Sem lista (app de antes do OTA que manda ela) não manda nada: mantém o
comportamento antigo em vez de arriscar o dobro.
"""
import json
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.features.push.sender import fetch_expo_tokens, fire_push
from src.features.reminders.service import BRT, pre_avisos_no_intervalo
from src.models.models import Reminder

logger = logging.getLogger(__name__)

# Som de disparo (o "alarme"), o mesmo da notificação local. Empacotado no build.
SOM_DISPARO = "sound-reminder.wav"

# Disparo vencido há mais que isso (backend fora do ar, por ex.) não vira push:
# lembrete velho chegando do nada mais confunde do que ajuda.
ATRASO_MAX = timedelta(minutes=5)

# Folga pra casar o instante do servidor com o timestamp que o app agendou (o
# app trabalha em ms; o banco pode guardar microssegundos).
FOLGA_MS = 2000

# Categoria de notificação registrada pelo app (CATEGORY_ID em notifications.js):
# é ela que põe "Adiar 5/10/30 min" ao segurar. Só no disparo; pré-aviso não adia.
CATEGORIA_LEMBRETE = "lembrete"

# Mesmos textos da notificação local do app (i18n/keys/notifications.js): o push
# tem que chegar IGUAL ao lembrete normal, inclusive o "segure para adiar" — as
# ações de adiar vêm da mesma categoria do app (CATEGORIA_LEMBRETE).
_TEXTOS = {
    "pt": {
        "titulo": "Lembrete: {titulo}",
        "corpo": "segure para adiar",
        "pre_titulo": "Chegando: {titulo}",
        "pre_corpo": "É {quando}, às {hora}.",
        "dia": ("daqui a {n} dia", "daqui a {n} dias"),
        "hora": ("daqui a {n} hora", "daqui a {n} horas"),
        "minuto": ("daqui a {n} minuto", "daqui a {n} minutos"),
    },
    "en": {
        "titulo": "Reminder: {titulo}",
        "corpo": "hold to snooze",
        "pre_titulo": "Coming up: {titulo}",
        "pre_corpo": "It's {quando}, at {hora}.",
        "dia": ("in {n} day", "in {n} days"),
        "hora": ("in {n} hour", "in {n} hours"),
        "minuto": ("in {n} minute", "in {n} minutes"),
    },
}

# Fim da janela do tick anterior: os pré-avisos são buscados em (anterior, agora].
_ultimo_tick: datetime | None = None
# Já enviados (chave → quando), pra um tick repetido não mandar de novo.
_enviados: dict[str, datetime] = {}


def _dt(iso: str) -> datetime:
    d = datetime.fromisoformat(iso)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _ms(d: datetime) -> int:
    return int(d.timestamp() * 1000)


def _arred(x: float) -> int:
    return int(x + 0.5)  # igual ao Math.round do app (o round do Python é bancário)


def _anteced(lead_seconds: float, txt: dict) -> str:
    """"daqui a 2 dias" / "daqui a 3 horas" / "daqui a 30 minutos" — mesma
    regra do anteced() do app."""
    s = max(60, _arred(lead_seconds))
    for unidade, chave in ((86400, "dia"), (3600, "hora"), (60, "minuto")):
        if s >= unidade or chave == "minuto":
            n = _arred(s / unidade)
            return txt[chave][0 if n == 1 else 1].format(n=n)
    return ""


def _textos(lang: str, titulo: str, tipo: str, instante: datetime, alvo: datetime) -> tuple[str, str]:
    txt = _TEXTOS.get(lang) or _TEXTOS["pt"]
    hora = alvo.astimezone(BRT).strftime("%H:%M")
    if tipo == "pre":
        quando = _anteced((alvo - instante).total_seconds(), txt)
        return (
            txt["pre_titulo"].format(titulo=titulo),
            txt["pre_corpo"].format(quando=quando, hora=hora),
        )
    return txt["titulo"].format(titulo=titulo), txt["corpo"]


async def _agendados(db: AsyncSession, user_id: str) -> dict | None:
    row = (
        await db.execute(
            text("SELECT items, lang, priority FROM device_schedules WHERE user_id = :u"),
            {"u": user_id},
        )
    ).first()
    if not row:
        return None
    try:
        items = json.loads(row[0])
    except Exception:  # noqa: BLE001
        items = []
    return {"items": items, "lang": row[1] or "pt", "priority": bool(row[2])}


def _ja_agendado(items: list, reminder_id: str, tipo: str, ms: int) -> bool:
    return any(
        it[0] == reminder_id and it[1] == tipo and abs(it[2] - ms) <= FOLGA_MS
        for it in items
    )


async def salvar_agendados(
    db: AsyncSession,
    user_id: str,
    items: list[tuple[str, str, int]],
    lang: str,
    priority: bool,
    append: bool,
) -> None:
    """Grava o retrato da fila do iPhone. `append` soma ao que já tinha (adiar
    pontual agenda 1 notificação sem refazer o sync); senão substitui."""
    if append:
        atual = await _agendados(db, user_id)
        if atual:
            corte = _ms(datetime.now(timezone.utc) - timedelta(hours=1))
            antigos = [tuple(it) for it in atual["items"] if it[2] >= corte]
            items = list(dict.fromkeys(antigos + items))
    await db.execute(
        text(
            "INSERT INTO device_schedules (user_id, items, lang, priority, updated_at) "
            "VALUES (:u, :i, :l, :p, :t) "
            "ON CONFLICT(user_id) DO UPDATE SET items = excluded.items, "
            "lang = excluded.lang, priority = excluded.priority, updated_at = excluded.updated_at"
        ),
        {
            "u": user_id,
            "i": json.dumps([list(it) for it in items]),
            "l": lang if lang in _TEXTOS else "pt",
            "p": 1 if priority else 0,
            "t": datetime.now(timezone.utc).isoformat(),
        },
    )


async def avisar_disparos(
    db: AsyncSession, vencidos: list[Reminder], agora: datetime, tick: timedelta
) -> None:
    """
    Roda a cada tick, ANTES de avançar os vencidos (precisa do next_execution
    deles). `vencidos` = lembretes com next_execution <= agora.
    """
    global _ultimo_tick
    inicio = _ultimo_tick or (agora - tick)
    _ultimo_tick = agora
    for chave in [k for k, t in _enviados.items() if agora - t > timedelta(hours=1)]:
        del _enviados[chave]

    # (lembrete, tipo, instante, disparo-alvo)
    pendentes: list[tuple[Reminder, str, datetime, datetime]] = []
    for r in vencidos:
        ts = _dt(r.next_execution)
        if agora - ts <= ATRASO_MAX:
            pendentes.append((r, "main", ts, ts))

    com_pre = (
        await db.execute(
            select(Reminder).where(Reminder.is_active == 1, Reminder.pre_reminders.isnot(None))
        )
    ).scalars().all()
    for r in com_pre:
        for pre, alvo in pre_avisos_no_intervalo(r, inicio, agora):
            pendentes.append((r, "pre", pre, alvo))

    if not pendentes:
        return

    por_usuario: dict[str, list] = {}
    for p in pendentes:
        por_usuario.setdefault(p[0].user_id, []).append(p)

    for user_id, itens in por_usuario.items():
        agendados = await _agendados(db, user_id)
        if agendados is None:
            continue  # app ainda sem o OTA: não dá pra saber o que o iPhone tem
        tokens: list[str] | None = None
        for r, tipo, instante, alvo in itens:
            ms = _ms(instante)
            chave = f"{r.id}_{tipo}_{ms}"
            if chave in _enviados or _ja_agendado(agendados["items"], r.id, tipo, ms):
                continue
            if tokens is None:
                tokens = await fetch_expo_tokens(db, user_id)
            if not tokens:
                break
            _enviados[chave] = agora
            titulo, corpo = _textos(agendados["lang"], r.title, tipo, instante, alvo)
            extra = {
                "priority": "high",
                "interruptionLevel": "time-sensitive" if agendados["priority"] else "active",
            }
            if tipo == "main":
                extra["categoryId"] = CATEGORIA_LEMBRETE
            recorrente = bool(r.recurrence) and r.recurrence != "once"
            fire_push(
                tokens,
                titulo,
                corpo,
                # title/isRecurring: o app adia com eles, igual à notificação local
                data={
                    "reminderId": r.id,
                    "tipo": "disparo",
                    "title": r.title,
                    "isRecurring": "1" if recorrente else "0",
                },
                sound=SOM_DISPARO,
                extra=extra,
            )
            logger.info("Push de disparo (%s), o iPhone não tinha agendado: %s", tipo, r.id)
