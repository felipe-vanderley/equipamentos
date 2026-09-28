// Cálculos de locação (funções puras)

export const arred = x => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
const DIA = 86400000;

export function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export function toISO(dt) { return dt.toISOString().slice(0, 10); }
export function addDias(dt, n) { const r = new Date(dt.getTime()); r.setUTCDate(r.getUTCDate() + n); return r; }
export function addMeses(dt, n) {
  const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + n, d = dt.getUTCDate();
  const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, ultimo)));
}

/** Dias corridos, contando início e término. */
export function diasEntre(ini, fim) { return Math.round((parseISO(fim) - parseISO(ini)) / DIA) + 1; }

function periodos(ini, fim, passoMeses, diasRef) {
  const a = parseISO(ini), fimExcl = addDias(parseISO(fim), 1);
  let n = 0;
  while (addMeses(a, (n + 1) * passoMeses) <= fimExcl) n++;
  const resto = Math.round((fimExcl - addMeses(a, n * passoMeses)) / DIA);
  return n + resto / diasRef;
}

/** Quantidade de períodos sugerida pelas datas (hora: informar manualmente). */
export function quantidadeSugerida(tipo, ini, fim) {
  if (!ini || !fim || fim < ini) return null;
  if (tipo === 'dia') return diasEntre(ini, fim);
  if (tipo === 'mes') return arred(periodos(ini, fim, 1, 30));
  if (tipo === 'ano') return arred(periodos(ini, fim, 12, 365));
  return null;
}

/**
 * Parcelas a receber do contrato.
 * mês/ano: uma parcela no fim de cada período (última = saldo, no término).
 * hora/dia ou modo "unica": parcela única no término.
 */
export function gerarParcelas({ tipo, valor_unitario, quantidade, data_inicio, data_termino, modo }) {
  const vu = Number(valor_unitario), q = Number(quantidade);
  const total = arred(vu * q);
  if (modo === 'unica' || tipo === 'hora' || tipo === 'dia' || q <= 1) {
    return [{ n: 1, de: 1, vencimento: data_termino, valor: total }];
  }
  const passo = tipo === 'mes' ? 1 : 12;
  const qtd = Math.ceil(q - 1e-9);
  const a = parseISO(data_inicio);
  const out = [];
  let acc = 0;
  for (let i = 1; i <= qtd; i++) {
    let venc = toISO(addDias(addMeses(a, i * passo), -1));
    if (i === qtd || venc > data_termino) venc = data_termino;
    const valor = i < qtd ? arred(vu) : arred(total - acc);
    acc = arred(acc + valor);
    out.push({ n: i, de: qtd, vencimento: venc, valor });
  }
  return out;
}
