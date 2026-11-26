// Trava de dado pessoal do diagnóstico. Os logs do Actions são públicos:
// se a saída de uma consulta tiver formato de e-mail, token, segredo, CPF ou
// telefone, o diagnóstico falha sem imprimir nada. Na dúvida, recusa.

const EMAIL = /[\w.+-]+(@|%40)[\w-]+\.[\w.-]+/i;
const JWT = /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/;
const TELEGRAM = /(?<!\d)\d{8,10}:[\w-]{30,}/;
const BEARER = /\bBearer\s+[\w.~+/=-]{16,}/i;
const CPF_FORMATADO = /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/;
const ONZE_DIGITOS = /(?<!\d)\d{11}(?!\d)/g;
// DDD + celular: "21 99999-8888", "(21) 99999-8888", "+55 21 99999-8888", "21999998888".
const TELEFONE = /(?<!\d)(\+?55[\s-]?)?\(?[1-9]\d\)?[\s-]?9\d{4}[\s-]?\d{4}(?!\d)/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIGRACAO = /^\d{14}_[a-z0-9_]+$/;
// Trecho longo sem espaços, procurado dentro do texto (aspas, JSON e URL não escondem).
const TRECHO_LONGO = /[A-Za-z0-9_+/=-]{32,}/g;

function cpfValido(d) {
  if (/^(\d)\1{10}$/.test(d)) return false;
  const digito = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

function pareceSegredo(trecho) {
  if (UUID.test(trecho) || MIGRACAO.test(trecho)) return false;
  const digitos = trecho.replace(/\D/g, "").length;
  const letras = trecho.replace(/[^A-Za-z]/g, "").length;
  return digitos >= 6 && letras >= 6;
}

function motivo(texto) {
  if (EMAIL.test(texto)) return "e-mail";
  if (JWT.test(texto) || TELEGRAM.test(texto) || BEARER.test(texto)) return "token";
  if (CPF_FORMATADO.test(texto)) return "CPF";
  if ((texto.match(ONZE_DIGITOS) ?? []).some(cpfValido)) return "CPF";
  if (TELEFONE.test(texto)) return "telefone";
  if ((texto.match(TRECHO_LONGO) ?? []).some(pareceSegredo)) return "segredo";
  return null;
}

/**
 * Percorre o resultado de uma consulta (valores e nomes de campos) e devolve
 * onde há algo com formato de dado pessoal. Nunca devolve o valor, só o
 * caminho e o motivo.
 */
export function problemasDeDadoPessoal(valor, caminho = "") {
  if (typeof valor === "string") {
    const m = motivo(valor);
    return m ? [{ caminho, motivo: m }] : [];
  }
  if (Array.isArray(valor)) {
    return valor.flatMap((v, i) => problemasDeDadoPessoal(v, `${caminho}[${i}]`));
  }
  if (valor && typeof valor === "object") {
    return Object.entries(valor).flatMap(([k, v]) => {
      const m = motivo(k);
      if (m) return [{ caminho: `${caminho}.(nome do campo)`, motivo: m }];
      return problemasDeDadoPessoal(v, caminho ? `${caminho}.${k}` : k);
    });
  }
  return [];
}

/**
 * Detalhe de um erro para o log público: até 500 caracteres, ou um aviso se o
 * texto tiver formato de dado pessoal (o Postgres costuma citar o valor que
 * causou o erro).
 */
export function detalheSeguro(texto) {
  const t = String(texto ?? "");
  return motivo(t) ? "(detalhe omitido: tinha formato de dado pessoal)" : t.slice(0, 500);
}

/** Imprime o resultado, ou falha sem imprimir se houver algo com cara de dado pessoal. */
export function imprimirSeguro(resultado) {
  const problemas = problemasDeDadoPessoal(resultado);
  if (problemas.length) {
    const onde = problemas.map((p) => `${p.caminho} (${p.motivo})`).join("; ");
    throw new Error(
      `Saída recusada: há valor com formato de dado pessoal em ${onde}. ` +
        "Os logs são públicos. Ajuste a consulta para devolver só nomes de objetos e contagens.",
    );
  }
  console.log(JSON.stringify(resultado, null, 2));
}
