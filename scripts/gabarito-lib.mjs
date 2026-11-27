// Trava de dado pessoal do gabarito da extração (P24) e das respostas gravadas.
// O repositório é público: os e-mails reais do dono entram só depois da troca de
// nome, e-mail, localizador, documento, telefone, bilhete, fidelidade, cartão e
// endereço por valores falsos. Esta trava recusa o que escapou com formato
// reconhecível; nome de pessoa não tem formato, por isso a lista de trocas é
// obrigatória e a revisão do dono continua valendo.
import { problemasDeDadoPessoal } from "./supabase-diagnostico-lib.mjs";

/** E-mails falsos permitidos: só domínios de exemplo (RFC 2606). */
const EMAIL_DE_EXEMPLO = /[\w.+-]+@(?:[\w-]+\.)*example\.(?:com|org|net)\b/gi;
/** Caracteres sem largura que alguns e-mails põem entre dígitos (escondem o formato). */
const INVISIVEIS = /[​-‍⁠﻿]/g;
/** 16 dígitos seguidos ou em grupos de 4: número de cartão. */
const CARTAO = /(?<!\d)(?:\d{4}[ .-]?){3}\d{4}(?!\d)/;

function textos(valor, caminho, saida) {
  if (typeof valor === "string") saida.push([caminho, valor]);
  else if (Array.isArray(valor)) valor.forEach((v, i) => textos(v, `${caminho}[${i}]`, saida));
  else if (valor && typeof valor === "object")
    for (const [k, v] of Object.entries(valor)) textos(v, caminho ? `${caminho}.${k}` : k, saida);
  return saida;
}

/**
 * Onde há algo com formato de dado pessoal num caso do gabarito ou numa resposta
 * gravada. Devolve só o caminho e o motivo, nunca o valor.
 */
export function problemasDoGabarito(dado, { exigirTrocas = true } = {}) {
  const problemas = [];
  if (exigirTrocas && (!Array.isArray(dado?.trocas) || dado.trocas.length === 0))
    problemas.push({ caminho: "trocas", motivo: "falta a lista do que foi trocado" });
  for (const [caminho, texto] of textos(dado, "", [])) {
    const limpo = texto.replace(INVISIVEIS, "").replace(EMAIL_DE_EXEMPLO, "(e-mail de exemplo)");
    const achados = problemasDeDadoPessoal(limpo, caminho);
    if (achados.length) problemas.push(...achados);
    else if (CARTAO.test(limpo)) problemas.push({ caminho, motivo: "cartão" });
  }
  return problemas;
}
