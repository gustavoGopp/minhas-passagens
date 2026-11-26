// Trava de dado pessoal do diagnóstico. Os logs do Actions são públicos:
// se a saída de uma consulta tiver formato de e-mail, token, segredo, CPF ou
// telefone, o diagnóstico falha sem imprimir nada.

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const JWT = /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/;
const CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
const TELEFONE = /(\+55[\s-]?\d{2}|\(\d{2}\))[\s-]?9?\d{4}[\s-]?\d{4}\b/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIGRACAO = /^\d{14}_[a-z0-9_]+(\.sql)?$/;

function pareceSegredo(palavra) {
  if (palavra.length < 32) return false;
  if (!/^[A-Za-z0-9_+/=-]+$/.test(palavra)) return false;
  if (UUID.test(palavra) || MIGRACAO.test(palavra)) return false;
  const digitos = palavra.replace(/\D/g, "").length;
  const letras = palavra.replace(/[^A-Za-z]/g, "").length;
  return digitos >= 6 && letras >= 6;
}

function motivo(texto) {
  if (EMAIL.test(texto)) return "e-mail";
  if (JWT.test(texto)) return "token";
  if (CPF.test(texto)) return "CPF";
  if (TELEFONE.test(texto)) return "telefone";
  if (texto.split(/[\s,;]+/).some(pareceSegredo)) return "segredo";
  return null;
}

/**
 * Percorre o resultado de uma consulta e devolve onde há algo com formato de
 * dado pessoal. Nunca devolve o valor, só o caminho e o motivo.
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
    return Object.entries(valor).flatMap(([k, v]) =>
      problemasDeDadoPessoal(v, caminho ? `${caminho}.${k}` : k),
    );
  }
  return [];
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
