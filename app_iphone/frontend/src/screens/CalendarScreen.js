import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  LayoutAnimation,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { anim, getLocale, t, useI18n } from '../i18n';
import { listReminders, syncReminders, updateReminder, createReminder, deleteReminder } from '../api/reminders.api';
import { scheduleFromSync } from '../services/notifications';
import { recurrenceLabel } from '../utils/recurrenceLabel';
import { detectIs12h } from '../utils/timeFormat';
import ChevronIcon from '../components/ChevronIcon';
import PressableScale from '../components/PressableScale';
import LoadingDog from '../components/LoadingDog';
import EditReminderModal from '../components/EditReminderModal';
import ConfirmDialog from '../components/ConfirmDialog';

const IS_12H = detectIs12h();
const SP_TZ = 'America/Sao_Paulo';
const MAX_MESES = 24; // teto do feed, pra um recorrente sem fim não estourar a lista

// Cor da bolinha por tipo de dia:
//   AZUL     → o dia tem PELO MENOS UM pontual. É o que importa destacar: um
//              lembrete pontual acontece só naquele dia, então saber a data exata
//              é o ponto do calendário.
//   CINZINHA → o dia só tem recorrente(s). Bem discreto de propósito (usa o cinza
//              "apagado" do tema, theme.textPlaceholder): um recorrente se repete,
//              então o dia exato importa menos.
const DOT_PONTUAL = '#0A84FF'; // = theme.primary

// LayoutAnimation no Android precisa opt-in (iOS já vem ligado).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
// Transição curta pra lista do dia: item criado desce entrando, excluído some.
// Também anima a bolinha aparecer/sumir no dia da grade.
function animarLista() {
  LayoutAnimation.configureNext({
    duration: 240,
    create: { type: 'easeInEaseOut', property: 'opacity' },
    update: { type: 'easeInEaseOut' },
    delete: { type: 'easeInEaseOut', property: 'opacity' },
  });
}

// Chave YYYY-MM-DD de uma data no fuso de Brasília (mesma convenção da aba de
// lembretes) — é o que casa a ocorrência com a célula do dia na grade.
function spDateKey(date) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: SP_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const get = tp => parts.find(p => p.type === tp)?.value;
    const y = get('year');
    return y ? `${y}-${get('month')}-${get('day')}` : '';
  } catch (e) {
    return ''; // data inválida (next_execution zoado) — não casa com nenhum dia
  }
}

const mm = n => String(n + 1).padStart(2, '0');
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Nome do mês + ano ("Setembro de 2026" / "September 2026").
function nomeMes(ano, mes) {
  try {
    const d = new Date(Date.UTC(ano, mes, 1, 15));
    return cap(new Intl.DateTimeFormat(getLocale(), { timeZone: SP_TZ, month: 'long', year: 'numeric' }).format(d));
  } catch (e) {
    return `${mes + 1}/${ano}`;
  }
}

// Cabeçalho do dia no sheet ("Terça, 23 de setembro").
function nomeDia(dayKey) {
  try {
    const [y, m, d] = String(dayKey).split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 15));
    return cap(new Intl.DateTimeFormat(getLocale(), {
      timeZone: SP_TZ, weekday: 'long', day: '2-digit', month: 'long',
    }).format(date));
  } catch (e) {
    return String(dayKey || '');
  }
}

function fmtHora(iso) {
  try {
    return new Intl.DateTimeFormat(getLocale(), {
      timeZone: SP_TZ, hour: '2-digit', minute: '2-digit', hour12: IS_12H,
    }).format(new Date(iso));
  } catch (e) {
    return '';
  }
}

function isRecurring(r) {
  return !!(r && r.recurrence && r.recurrence !== 'once');
}

// ─── expansão de recorrência no cliente ───
// O scheduled_executions do server só cobre um horizonte curto (~2 meses, por
// causa do teto de 64 notificações locais do iOS). Pro calendário, isso deixava
// meses à frente vazios de recorrente. Então expandimos aqui, dia a dia, ao longo
// de TODO o feed — usando os campos estruturados (recurrence, days_of_week,
// interval_seconds) e o next_execution como âncora de dia-da-semana/dia-do-mês/hora.

function daysBetweenKeys(aKey, bKey) {
  const [ay, am, ad] = aKey.split('-').map(Number);
  const [by, bm, bd] = bKey.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// Dia da semana no padrão do app (Seg=0 .. Dom=6).
function weekdayFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

const domFromKey = key => Number(key.split('-')[2]);

// Horário do lembrete em minutos desde a meia-noite (fuso SP) — pra ordenar o dia.
function todMinutes(iso) {
  if (!iso) return 0;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: SP_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(iso));
    const h = Number(parts.find(p => p.type === 'hour')?.value || 0) % 24;
    const mnt = Number(parts.find(p => p.type === 'minute')?.value || 0);
    return h * 60 + mnt;
  } catch (e) {
    return 0;
  }
}

// Este lembrete cai neste dia? `neKey` = dia (SP) do next_execution (âncora).
function occursOnKey(rem, key, neKey) {
  switch (rem.recurrence) {
    case 'daily':
      return true;
    case 'weekly':
      return weekdayFromKey(key) === weekdayFromKey(neKey);
    case 'weekly_days': {
      const days = Array.isArray(rem.days_of_week) ? rem.days_of_week : [];
      return days.includes(weekdayFromKey(key));
    }
    case 'monthly':
    case 'day_of_month':
      return domFromKey(key) === domFromKey(neKey);
    case 'interval_seconds': {
      const s = rem.interval_seconds || 0;
      if (s <= 0) return false;
      if (s < 86400) return true; // sub-diário → aparece todo dia
      const stepDays = Math.max(1, Math.round(s / 86400));
      const diff = daysBetweenKeys(neKey, key);
      return diff >= 0 && diff % stepDays === 0;
    }
    default:
      return false; // tipo desconhecido → cai no reforço do scheduled_executions
  }
}

// Matriz do mês: semanas de 7 (começa no domingo), null nas bordas vazias.
function matrizMes(ano, mes) {
  const primeiro = new Date(ano, mes, 1).getDay();          // 0=domingo
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const celulas = [...Array(primeiro).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => i + 1)];
  while (celulas.length % 7 !== 0) celulas.push(null);
  const semanas = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  return semanas;
}

const contagemLabel = n => (n === 1 ? t('calendar.reminderCountOne') : t('calendar.reminderCountMany', { n }));

// ─── célula de um dia: número + bolinha (clara=tem pontual / escura=só recorrente) ───
// dotKind: 0 = nada · 1 = só recorrente (azul escuro) · 2 = tem pontual (azul claro)
function DiaCelula({ dia, dayKey, dotKind, isHoje, isPast, sel, onPress, onBlocked, styles, theme }) {
  const temLembrete = dotKind > 0;
  const pop = useRef(new Animated.Value(temLembrete ? 0.5 : 1)).current;
  // Bolinha de seleção: cresce/some ao tocar o dia (em vez de aparecer seco).
  const selAnim = useRef(new Animated.Value(sel ? 1 : 0)).current;
  // Flash vermelho ao tocar um dia passado (não dá pra voltar no tempo).
  const flash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (temLembrete) {
      pop.setValue(0.5);
      Animated.spring(pop, {
        toValue: 1, useNativeDriver: true, tension: 150, friction: 7,
        delay: Math.min(dia, 20) * 14,
      }).start();
    }
  }, [dia, dayKey, temLembrete, pop]);
  useEffect(() => {
    Animated.spring(selAnim, { toValue: sel ? 1 : 0, useNativeDriver: true, tension: 180, friction: 12 }).start();
  }, [sel, selAnim]);

  if (dia == null) return <View style={styles.celula} />;

  const dotColor = dotKind === 2 ? DOT_PONTUAL : theme.textPlaceholder;

  const handlePress = () => {
    if (isPast) {
      // Dia no passado: pisca vermelho e avisa, sem abrir a criação.
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 110, useNativeDriver: true }),
        Animated.delay(450),
        Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start();
      onBlocked?.();
      return;
    }
    onPress();
  };

  return (
    <Pressable style={styles.celula} onPress={handlePress}>
      <View style={[styles.diaBolha, isHoje && !sel && { borderWidth: 1, borderColor: theme.textSecondary }]}>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: 17, backgroundColor: theme.primary, opacity: selAnim,
              transform: [{ scale: selAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: 17, backgroundColor: theme.error, opacity: flash }]}
        />
        <Text style={[styles.diaTxt, { color: sel ? '#FFFFFF' : (isPast ? theme.textPlaceholder : theme.textPrimary) }, isHoje && !sel && { fontWeight: '800' }]}>{dia}</Text>
      </View>
      {temLembrete
        ? <Animated.View style={[styles.dot, { backgroundColor: dotColor, transform: [{ scale: pop }] }]} />
        : <View style={styles.dotVazio} />}
    </Pressable>
  );
}

// ─── um mês inteiro no feed, com entrada suave ───
function MesCard({ ano, mes, occByDay, todayKey, selDay, onDayPress, onBlocked, styles, theme, lang }) {
  const entrada = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entrada, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [entrada]);

  const semana = lang === 'en' ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const semanas = useMemo(() => matrizMes(ano, mes), [ano, mes]);
  const prefixo = `${ano}-${mm(mes)}`;

  return (
    <Animated.View
      style={{ opacity: entrada, transform: [{ translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}
    >
      <View style={styles.card}>
        <Text style={styles.mesTitulo}>{anim(nomeMes(ano, mes))}</Text>
        <View style={styles.semanaRow}>
          {semana.map((d, i) => <Text key={i} style={styles.semanaTxt}>{d}</Text>)}
        </View>
        {semanas.map((wk, wi) => (
          <View key={wi} style={styles.semanaGrid}>
            {wk.map((dia, di) => {
              if (dia == null) return <View key={`x${di}`} style={styles.celula} />;
              const dayKey = `${prefixo}-${String(dia).padStart(2, '0')}`;
              const occs = occByDay[dayKey];
              const dotKind = !occs?.length ? 0 : (occs.some(o => !isRecurring(o.reminder)) ? 2 : 1);
              return (
                <DiaCelula
                  key={dayKey}
                  dia={dia}
                  dayKey={dayKey}
                  dotKind={dotKind}
                  isHoje={dayKey === todayKey}
                  isPast={dayKey < todayKey}
                  sel={dayKey === selDay}
                  onPress={() => onDayPress(dayKey)}
                  onBlocked={onBlocked}
                  styles={styles}
                  theme={theme}
                />
              );
            })}
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── sheet do dia: sobe de baixo, separa recorrentes de pontuais ───
function DaySheet({ dayKey, occurrences, onClose, onEdit, onCreate, onDelete, theme }) {
  useI18n();
  const styles = useMemo(() => makeSheetStyles(theme), [theme]);
  const visible = !!dayKey;
  const [mounted, setMounted] = useState(false);
  const translateY = useRef(new Animated.Value(500)).current;
  const overlay = useRef(new Animated.Value(0)).current;

  // Retém o último dia/ocorrências: ao fechar, `dayKey` já vira null, mas o sheet
  // continua montado durante o slide de saída — renderizar com null quebraria
  // (nomeDia(null)). Mostra o mesmo conteúdo até a animação terminar.
  const lastKey = useRef(null);
  const lastOcc = useRef([]);
  if (dayKey) { lastKey.current = dayKey; lastOcc.current = occurrences || []; }
  const showKey = lastKey.current;
  const showOcc = lastOcc.current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.setValue(500);
      overlay.setValue(0);
      Animated.parallel([
        Animated.timing(overlay, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 68, friction: 11 }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(overlay, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 500, duration: 220, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [visible, mounted, translateY, overlay]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 3,
      onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 60 || g.vy > 0.5) onClose();
        else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      },
    }),
  ).current;

  const { recorrentes, pontuais } = useMemo(() => {
    const rec = [], pon = [];
    for (const o of (showOcc || []).slice().sort((a, b) => a.tod - b.tod)) {
      (isRecurring(o.reminder) ? rec : pon).push(o);
    }
    return { recorrentes: rec, pontuais: pon };
  }, [showOcc]);

  if (!mounted || !showKey) return null;

  const total = (showOcc || []).length;

  // Toque = editar · segurar = excluir (mesma pegada da aba de Lembretes).
  const renderItem = o => (
    <PressableScale
      key={o.reminder.id}
      style={styles.item}
      onPress={() => onEdit(o.reminder)}
      onLongPress={() => onDelete(o.reminder)}
      delayLongPress={350}
    >
      <View style={[styles.itemDot, { backgroundColor: isRecurring(o.reminder) ? theme.textPlaceholder : DOT_PONTUAL }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle} numberOfLines={2}>{o.reminder.title}</Text>
        {recurrenceLabel(o.reminder) ? (
          <Text style={styles.itemSub}>{recurrenceLabel(o.reminder)}</Text>
        ) : null}
      </View>
      <Text style={styles.itemHora}>{anim(fmtHora(o.reminder.next_execution))}</Text>
      <ChevronIcon direction="right" color={theme.textSecondary} size={22} />
    </PressableScale>
  );

  // Overlay INTERNO (não é <Modal>) de propósito: assim a edição — que É um
  // <Modal> — abre por cima sem ser "modal sobre modal" (o que crashava/travava
  // no iOS). O <Modal> renderiza numa janela nativa acima de tudo, então fica
  // por cima deste overlay naturalmente.
  return (
    <Animated.View style={[styles.overlay, { opacity: overlay }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View style={styles.handleArea} {...pan.panHandlers}>
          <View style={styles.handle} />
        </View>
        <View style={styles.sheetHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>{anim(nomeDia(showKey))}</Text>
            {total > 0 && <Text style={styles.sheetCount}>{contagemLabel(total)}</Text>}
          </View>
          <PressableScale
            onPress={() => onCreate(showKey)}
            style={styles.addBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={t('calendar.createReminder')}
            accessibilityRole="button"
          >
            <Text style={styles.addBtnPlus}>+</Text>
          </PressableScale>
        </View>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {total === 0 ? (
            <View style={styles.emptyDay}>
              <Text style={styles.emptyDayText}>{t('calendar.emptyDay')}</Text>
              <PressableScale onPress={() => onCreate(showKey)} style={styles.createBtn} applyStyleToRoot>
                <Text style={styles.createBtnText}>{t('calendar.createReminder')}</Text>
              </PressableScale>
            </View>
          ) : (
            <>
              {pontuais.length > 0 && (
                <>
                  <Text style={styles.secao}>{t('calendar.oneTime')}</Text>
                  {pontuais.map(renderItem)}
                </>
              )}
              {recorrentes.length > 0 && (
                <>
                  <Text style={[styles.secao, pontuais.length > 0 && { marginTop: 20 }]}>{t('calendar.recurring')}</Text>
                  {recorrentes.map(renderItem)}
                </>
              )}
              <Text style={styles.holdHint}>{t('calendar.holdToDelete')}</Text>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

export default function CalendarScreen({ navigation }) {
  const { theme } = useTheme();
  const { lang } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);
  const [occByDay, setOccByDay] = useState({});
  const [meses, setMeses] = useState([]);
  const [selDay, setSelDay] = useState(null);
  const [editingReminder, setEditingReminder] = useState(null);
  const [deletingReminder, setDeletingReminder] = useState(null);
  const [toast, setToast] = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef(null);

  const todayKey = useMemo(() => spDateKey(new Date()), []);

  // Aviso "não dá pra voltar no tempo" ao tocar num dia passado.
  const showBlocked = useCallback(() => {
    setToast(t('calendar.pastDay'));
    clearTimeout(toastTimer.current);
    Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setToast('');
      });
    }, 1800);
  }, [toastAnim]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const carregar = useCallback(async (opts) => {
    try {
      const [lista, sync] = await Promise.all([
        listReminders({ activeOnly: true }),
        syncReminders(),
      ]);
      const byId = {};
      for (const r of lista.reminders || []) byId[r.id] = r;

      const hoje = new Date();
      const todayK = spDateKey(hoje);

      // Fim do feed = dia mais distante que a gente conhece: os PONTUAIS (once)
      // definem o alcance "natural" (o lembrete mais longo ainda não concluído);
      // os scheduled_executions também podem empurrar o fim. Comparar YYYY-MM-DD
      // como string já ordena por data.
      let endKey = todayK;
      for (const r of lista.reminders || []) {
        if ((!r.recurrence || r.recurrence === 'once') && r.next_execution) {
          const k = spDateKey(new Date(r.next_execution));
          if (k > endKey) endKey = k;
        }
      }
      for (const sr of sync.reminders || []) {
        for (const iso of sr.scheduled_executions || []) {
          const k = spDateKey(new Date(iso));
          if (k > endKey) endKey = k;
        }
      }

      // Meses do feed: do mês atual até o mês do endKey (teto MAX_MESES).
      const startAno = hoje.getFullYear();
      const startMes = hoje.getMonth();
      const [ey, em] = endKey.split('-').map(Number);
      let span = (ey - startAno) * 12 + ((em - 1) - startMes);
      span = Math.max(0, Math.min(span, MAX_MESES));
      const lista2 = [];
      for (let i = 0; i <= span; i++) {
        const total = startMes + i;
        lista2.push({ ano: startAno + Math.floor(total / 12), mes: total % 12 });
      }

      // Todos os dias do feed, de hoje pra frente (as chaves das células).
      const dias = [];
      for (const { ano, mes } of lista2) {
        const dim = new Date(ano, mes + 1, 0).getDate();
        for (let d = 1; d <= dim; d++) {
          const k = `${ano}-${mm(mes)}-${String(d).padStart(2, '0')}`;
          if (k >= todayK) dias.push(k);
        }
      }

      // occByDay: cada dia → ocorrências { reminder, tod }. Expansão no cliente
      // (cobre TODOS os meses do feed) + reforço do scheduled_executions (tipos
      // desconhecidos e casos de borda). Dedup por (id + dia).
      const map = {};
      const addOcc = (rem, key, tod) => {
        (map[key] ||= []);
        if (map[key].some(o => o.reminder.id === rem.id)) return;
        map[key].push({ reminder: rem, tod });
      };
      for (const rem of lista.reminders || []) {
        const neKey = rem.next_execution ? spDateKey(new Date(rem.next_execution)) : null;
        const tod = todMinutes(rem.next_execution);
        if (!rem.recurrence || rem.recurrence === 'once') {
          if (neKey && neKey >= todayK) addOcc(rem, neKey, tod);
          continue;
        }
        if (!neKey) continue; // recorrente sem âncora — pula (raro)
        for (const key of dias) {
          if (occursOnKey(rem, key, neKey)) addOcc(rem, key, tod);
        }
      }
      for (const sr of sync.reminders || []) {
        const rem = byId[sr.id];
        if (!rem) continue;
        for (const iso of sr.scheduled_executions || []) {
          const key = spDateKey(new Date(iso));
          if (key >= todayK) addOcc(rem, key, todMinutes(iso));
        }
      }

      // Animação de entra/sai (item criado desce na lista, excluído some, bolinha
      // do dia aparece/some) — só quando a mudança veio de uma ação do usuário.
      if (opts?.animate) animarLista();
      setOccByDay(map);
      setMeses(lista2);
    } catch (e) {
      console.warn('[CalendarScreen] erro ao carregar:', e);
      // Feed mínimo: só o mês atual, sem marcações.
      const hoje = new Date();
      setOccByDay({});
      setMeses([{ ano: hoje.getFullYear(), mes: hoje.getMonth() }]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  // Tocar num lembrete → abre a edição por cima do sheet. O sheet do dia agora é
  // um overlay interno (não-Modal), então a edição (Modal) sobe por cima sem o
  // problema de "modal sobre modal". O sheet fica montado embaixo e se atualiza
  // sozinho quando o carregar() roda no save.
  const handleEditFromSheet = useCallback(rem => setEditingReminder(rem), []);

  // Botão "+" / "Criar lembrete" → abre o mesmo modal em modo NOVO, com a data já
  // preenchida no dia tocado (09:00 como padrão). Sem id = criação.
  const handleCreateForDay = useCallback(dayKey => {
    const [y, m, d] = String(dayKey).split('-').map(Number);
    let dt;
    if (dayKey === todayKey) {
      // Hoje: default no próximo horário cheio (senão o 09:00 já teria passado e
      // cairia direto no bloqueio "não dá pra voltar no tempo").
      const now = new Date();
      dt = new Date(now);
      dt.setHours(now.getHours() + 1, 0, 0, 0);
    } else {
      dt = new Date(y, m - 1, d, 9, 0, 0, 0); // dias futuros: 09:00
    }
    setEditingReminder({
      title: '',
      recurrence: 'once',
      next_execution: dt.toISOString(),
      days_of_week: [],
      interval_seconds: null,
      pre_reminders: [],
    });
  }, [todayKey]);

  // Salvar → só grava (cria sem id / edita com id). NÃO fecha nem anima aqui: o
  // próprio modal desce animado e, no onClose (modal já fora), o calendário
  // recarrega com a animação da lista — separar isso do teardown do Modal é o que
  // evita o crash no iOS. Re-lança o erro pra o modal NÃO fechar se a gravação
  // falhar. A reprogramação das notificações vai em segundo plano (não segura o
  // fechamento).
  const handleSaveEdit = useCallback(async (id, data) => {
    try {
      if (id) await updateReminder(id, data);
      else await createReminder(data);
    } catch (e) {
      Alert.alert(t('reminders.errorTitle'), t(id ? 'reminders.updateFailed' : 'reminders.createFailed'));
      console.warn('[CalendarScreen] erro ao salvar:', e);
      throw e;
    }
    syncReminders().then(scheduleFromSync).catch(e => console.warn('[CalendarScreen] resched:', e));
  }, []);

  // Segurar um lembrete → confirma e exclui.
  const confirmDelete = useCallback(async () => {
    const rem = deletingReminder;
    if (!rem) return;
    setDeletingReminder(null);
    try {
      await deleteReminder(rem.id);
      await carregar({ animate: true });
      const syncData = await syncReminders();
      await scheduleFromSync(syncData);
    } catch (e) {
      Alert.alert(t('reminders.errorTitle'), t('reminders.deleteFailed'));
      console.warn('[CalendarScreen] erro ao excluir:', e);
    }
  }, [deletingReminder, carregar]);

  const temAlgum = useMemo(() => Object.keys(occByDay).length > 0, [occByDay]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <PressableScale onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 18, right: 18 }}>
          <ChevronIcon color={theme.primary} size={38} style={styles.backButton} />
        </PressableScale>
        <Text style={styles.headerTitle}>{t('calendar.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <LoadingDog size={76} color={theme.primary} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            data={meses}
            keyExtractor={m => `${m.ano}-${m.mes}`}
            renderItem={({ item }) => (
              <MesCard
                ano={item.ano}
                mes={item.mes}
                occByDay={occByDay}
                todayKey={todayKey}
                selDay={selDay}
                onDayPress={setSelDay}
                onBlocked={showBlocked}
                styles={styles}
                theme={theme}
                lang={lang}
              />
            )}
            ListHeaderComponent={
              <View>
                <Text style={styles.hint}>{temAlgum ? t('calendar.hint') : t('calendar.empty')}</Text>
                {temAlgum && (
                  <View style={styles.legendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: DOT_PONTUAL }]} />
                      <Text style={styles.legendTxt}>{t('calendar.legendOneTime')}</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: theme.textPlaceholder }]} />
                      <Text style={styles.legendTxt}>{t('calendar.legendRecurring')}</Text>
                    </View>
                  </View>
                )}
              </View>
            }
            ListFooterComponent={
              !temAlgum ? <Text style={styles.emptySub}>{t('calendar.emptySub')}</Text> : <View style={{ height: 24 }} />
            }
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={2}
            windowSize={5}
          />
        </View>
      )}

      <DaySheet
        dayKey={selDay}
        occurrences={selDay ? occByDay[selDay] : null}
        onClose={() => setSelDay(null)}
        onEdit={handleEditFromSheet}
        onCreate={handleCreateForDay}
        onDelete={setDeletingReminder}
        theme={theme}
      />

      <EditReminderModal
        visible={!!editingReminder}
        reminder={editingReminder}
        onSave={handleSaveEdit}
        onClose={() => {
          setEditingReminder(null);
          // Deixa o Modal FECHAR de fato antes de rodar o LayoutAnimation da lista
          // (o teardown do Modal + LayoutAnimation ao mesmo tempo crashava no iOS).
          // Depois de fora, o carregar animado faz o item novo descer na lista.
          setTimeout(() => carregar({ animate: true }), 260);
        }}
        theme={theme}
      />

      <ConfirmDialog
        visible={!!deletingReminder}
        title={t('reminders.deleteTitle')}
        message={deletingReminder ? t('reminders.deleteMessage', { title: deletingReminder.title }) : ''}
        confirmText={t('common.delete')}
        destructive
        onCancel={() => setDeletingReminder(null)}
        onConfirm={confirmDelete}
      />

      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.toastWrap, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] }]}
        >
          <View style={styles.toastPill}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary, fontFamily: 'System' },
    backButton: { width: 44, textAlign: 'center' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    listContent: { padding: 16, paddingBottom: 32, gap: 14 },
    hint: {
      color: theme.textSecondary, fontSize: 13, textAlign: 'center',
      marginBottom: 4, lineHeight: 19, fontFamily: 'System',
    },
    emptySub: {
      color: theme.textPlaceholder, fontSize: 13, textAlign: 'center',
      marginTop: 4, lineHeight: 19, fontFamily: 'System',
    },
    legendRow: {
      flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 8, marginBottom: 2,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendTxt: { color: theme.textSecondary, fontSize: 12, fontFamily: 'System' },
    toastWrap: { position: 'absolute', top: 64, left: 0, right: 0, alignItems: 'center', zIndex: 50, elevation: 50 },
    toastPill: {
      backgroundColor: theme.error, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10, maxWidth: '90%',
      shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8,
    },
    toastText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', fontFamily: 'System', textAlign: 'center' },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    mesTitulo: {
      fontSize: 17, fontWeight: '800', color: theme.textPrimary,
      fontFamily: 'System', marginBottom: 10, marginLeft: 2,
    },
    semanaRow: { flexDirection: 'row', marginBottom: 4 },
    semanaTxt: { flex: 1, textAlign: 'center', color: theme.textSecondary, fontSize: 12, fontWeight: '700', fontFamily: 'System' },
    semanaGrid: { flexDirection: 'row' },
    celula: { flex: 1, alignItems: 'center', paddingVertical: 3, gap: 3 },
    diaBolha: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    diaTxt: { fontSize: 15, fontWeight: '600', fontFamily: 'System' },
    dot: { width: 6, height: 6, borderRadius: 3 },
    dotVazio: { width: 6, height: 6 },
  });
}

function makeSheetStyles(theme) {
  return StyleSheet.create({
    overlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
      zIndex: 30, elevation: 30,
    },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      maxHeight: Dimensions.get('window').height * 0.82,
    },
    handleArea: { paddingTop: 14, paddingBottom: 12, alignItems: 'center' },
    handle: { width: 48, height: 5, backgroundColor: theme.border, borderRadius: 3 },
    sheetHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 6 },
    sheetTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary, fontFamily: 'System' },
    sheetCount: { fontSize: 13, color: theme.textSecondary, fontFamily: 'System', marginTop: 3 },
    addBtn: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary,
      alignItems: 'center', justifyContent: 'center', marginLeft: 12,
    },
    addBtnPlus: { color: '#FFFFFF', fontSize: 26, fontWeight: '600', lineHeight: 30, marginTop: -2 },
    scrollContent: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40 },
    emptyDay: { alignItems: 'center', paddingTop: 24, paddingBottom: 8 },
    emptyDayText: { color: theme.textSecondary, fontSize: 14, marginBottom: 18, fontFamily: 'System' },
    createBtn: {
      backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 14,
      paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center',
    },
    createBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', fontFamily: 'System' },
    holdHint: {
      color: theme.textPlaceholder, fontSize: 12, textAlign: 'center',
      marginTop: 14, fontStyle: 'italic', fontFamily: 'System',
    },
    secao: {
      fontSize: 12, fontWeight: '700', color: theme.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, fontFamily: 'System',
    },
    item: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: theme.surface2, borderRadius: 12, padding: 14, marginBottom: 8,
    },
    itemDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary },
    itemTitle: { fontSize: 15, fontWeight: '600', color: theme.textPrimary, fontFamily: 'System' },
    itemSub: { fontSize: 12, color: theme.primary, marginTop: 3, fontFamily: 'System' },
    itemHora: { fontSize: 14, fontWeight: '700', color: theme.textPrimary, fontFamily: 'System' },
  });
}
