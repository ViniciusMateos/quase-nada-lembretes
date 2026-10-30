"""
Envio de push via Expo Push Service (https://exp.host).

É isto que notifica "lembrete criado" quando o app está FECHADO/em background —
o cliente não consegue (o iOS suspende o JS). O backend cria o lembrete e dispara
o push, que chega mesmo com o app matado. Em foreground o expo-notifications
suprime o push por padrão, então não duplica com o feedback in-app.

Best-effort: falha em silêncio (sem token, sem rede, etc.).
"""
import asyncio
import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.models import PushToken

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# Som de "lembrete criado / mensagem" — o mesmo do chat. Empacotado no bundle
# nativo via config plugin do expo-notifications (app.config.js). No push do Expo
# o som custom é o NOME DO ARQUIVO COM EXTENSÃO (não "default", que toca o padrão
# do iPhone). Só toca a partir do build que empacotou o arquivo.
PUSH_SOUND = "sound-receive.wav"

# Mantém referência às tasks fire-and-forget pra elas não serem coletadas pelo GC.
_bg_tasks: set[asyncio.Task] = set()


async def fetch_expo_tokens(db: AsyncSession, user_id: str) -> list[str]:
    rows = (
        await db.execute(select(PushToken.token).where(PushToken.user_id == user_id))
    ).scalars().all()
    return [t for t in rows if t and t.startswith("ExponentPushToken")]


async def _post_expo(
    tokens: list[str],
    title: str,
    body: str,
    data: dict | None,
    sound: str,
    extra: dict | None,
) -> None:
    messages = [
        {"to": t, "title": title, "body": body, "sound": sound, "data": data or {}, **(extra or {})}
        for t in tokens
    ]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                EXPO_PUSH_URL, json=messages, headers={"Content-Type": "application/json"}
            )
            if resp.status_code >= 400:
                logger.warning("Expo push HTTP %s: %s", resp.status_code, resp.text[:200])
                return
            # 200 não quer dizer entregue: o erro por token vem no ticket.
            for ticket in resp.json().get("data") or []:
                if ticket.get("status") == "error":
                    logger.warning("Expo push recusado: %s", ticket.get("message", "")[:200])
    except Exception as e:  # noqa: BLE001 — best-effort
        logger.warning("Falha ao enviar push Expo: %s", e)


def fire_push(
    tokens: list[str],
    title: str,
    body: str,
    data: dict | None = None,
    sound: str = PUSH_SOUND,
    extra: dict | None = None,
) -> None:
    """Dispara o push sem bloquear a resposta (fire-and-forget).
    `extra` entra direto na mensagem do Expo (priority, interruptionLevel...)."""
    if not tokens:
        return
    task = asyncio.create_task(_post_expo(tokens, title, body, data, sound, extra))
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)
