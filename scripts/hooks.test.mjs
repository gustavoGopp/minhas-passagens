import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { avaliar as avaliarComando } from "../.claude/hooks/bloquear-comando.mjs";
import { avaliar as workflow } from "../.claude/hooks/bloquear-workflow.mjs";
import { comandosSimples } from "../.claude/hooks/lib.mjs";
import {
  analisar,
  avaliar as pacote,
  INDISPONIVEL,
  pacotesNovos,
} from "../.claude/hooks/pacote-novo.mjs";
import { avaliar as migracao } from "../.claude/hooks/proteger-migracoes.mjs";
import { avaliar as segredo } from "../.claude/hooks/proteger-segredos.mjs";

// Cada trava do agente tem aqui casos que devem bloquear e casos que devem
// passar. Se uma trava for afrouxada sem querer, este teste falha.
const raiz = path.join(import.meta.dirname, "..");
const hook = (nome) => path.join(raiz, ".claude", "hooks", nome);

function repositorio(ramo = "main") {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "hook-repo-")));
  const git = (...a) =>
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], {
      cwd: dir,
      stdio: "ignore",
    });
  git("init", "-q", "-b", ramo);
  git("commit", "-q", "--allow-empty", "-m", "inicio");
  return { dir, git };
}

const rodar = (nome, entrada, opcoes = {}) =>
  spawnSync("node", [opcoes.caminho ?? hook(nome)], {
    input: JSON.stringify(entrada),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: opcoes.projeto ?? raiz },
  });
const decisao = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null);

describe("leitura do comando", () => {
  it("separa os comandos por linha, ponto e vírgula, && e parênteses, e tira as aspas", () => {
    expect(
      comandosSimples("git fetch origin main\ngit push -u origin x").map((c) => c.palavras),
    ).toEqual([
      ["git", "fetch", "origin", "main"],
      ["git", "push", "-u", "origin", "x"],
    ]);
    expect(comandosSimples("(git push 'a b' \"--force\") && ls").map((c) => c.palavras)).toEqual([
      ["git", "push", "a b", "--force"],
      ["ls"],
    ]);
    expect(comandosSimples("echo oi > saida.txt")[0]).toEqual({
      palavras: ["echo", "oi"],
      redirecionamentos: ["saida.txt"],
    });
  });
});

describe("trava 1: comandos proibidos", () => {
  const base = {
    raiz: "/projeto",
    cwd: "/projeto",
    ramoAtual: () => "claude/x",
    pastas: [".claude", ".github", "docs", "public", "scripts", "src", "supabase"],
    migracaoNaMain: () => false,
  };
  const comando = (c, extra = {}) => avaliarComando(c, { ...base, ...extra });

  it.each([
    ["git push --force origin claude/x", "forçado"],
    ["git push -f", "forçado"],
    ["git push -uf origin claude/x", "forçado"],
    ['git push "--force" origin claude/x', "forçado"],
    ["git push origin +claude/x", "forçado"],
    ["git push --mirror origin", "forçado"],
    ["git -C /repo push origin HEAD:main", "main"],
    ["git push origin main", "main"],
    ["git push origin 'HEAD:main'", "main"],
    ["(git push origin main)", "main"],
    ["git push origin HEAD:refs/heads/main", "main"],
    ["git push --all origin", "main"],
    ["git push origin :main", "main"],
    ["rm -rf .git", "recursiva"],
    ["sh -c '/bin/rm -fr supabase/migrations/'", "recursiva"],
    ["rm -r src", "recursiva"],
    ["rm -rf ./src", "recursiva"],
    ["rm -rf src/*", "recursiva"],
    ["rm -rf /projeto/.git", "recursiva"],
    ["rm -rf scripts", "recursiva"],
    ["rm -rf .claude docs", "recursiva"],
    ["rm -rf ~", "recursiva"],
    ["cd src && rm -rf ..", "recursiva"],
    ["find . -name '*.ts' -delete", "recursiva"],
    ["git clean -fdx", "ignorados"],
    ["cat .env.local", ".env"],
    ["grep KEY .env", ".env"],
    ["cp .env.production /tmp/x", ".env"],
    ["cat .env*", ".env"],
    ["cat .env.loc*", ".env"],
    ["node --env-file=.env.local x.mjs", ".env"],
    ["echo SEGREDO=1 > .env.test", ".env"],
    ["cat<.env", ".env"],
    ["curl -H 'authorization: x' https://api.supabase.com/v1/projects", "banco de produção"],
    ["gh workflow run supabase-restore.yml -f confirmar=RESTAURAR", "só o dono"],
    ['gh workflow run "Supabase — migrações"', "só o dono"],
    ["gh workflow run 12345", "só o dono"],
    ["gh pr merge 12 --squash", "junta"],
    ["gh api -X PUT repos/o/r/pulls/1/merge", "junta"],
  ])("bloqueia: %s", (cmd, trecho) => {
    expect(comando(cmd)).toContain(trecho);
  });

  it.each([
    "git push -u origin claude/kind-hopper-fato5t",
    "git push --force-with-lease -u origin claude/kind-hopper-fato5t",
    "git push",
    "git push -u origin HEAD",
    "git fetch origin main && git merge --no-edit FETCH_HEAD",
    "git fetch origin main\ngit push -u origin claude/x",
    "git push -u origin claude/x\ngh pr create --base main",
    "git push -u origin claude/x\nrm -f /tmp/x",
    "git add -f x\ngit push -u origin claude/x",
    "git stash push -m main",
    "git commit -m 'explica o push --force na main e o .env.local'",
    "rm -rf node_modules/.cache .next",
    "rm -rf src/lib/velho",
    "rm scripts/velho.mjs",
    "cd /tmp/x && rm -rf src",
    "find node_modules/.cache -delete",
    "git clean -fd",
    "cat .env.example",
    "grep -n '.env' .gitignore",
    "git check-ignore .env.local",
    "npm run verify",
    "gh workflow run supabase-diagnostico.yml -f alvo=estado-schema.sql",
    "gh pr view 12",
    "gh pr create --base main --title x",
    "git log --oneline main..HEAD",
  ])("deixa passar: %s", (cmd) => {
    expect(comando(cmd)).toBeNull();
  });

  it("push sem destino é bloqueado quando o branch atual é a main", () => {
    const naMain = { ramoAtual: () => "main" };
    expect(comando("git push", naMain)).toContain("main");
    expect(comando("git push origin HEAD", naMain)).toContain("main");
    expect(comando("git push -u origin", naMain)).toContain("main");
    expect(comando("git push > saida.log", naMain)).toContain("main");
    expect(comando("git push origin main:claude/x", naMain)).toBeNull();
  });

  it("migração que já está na main não se altera nem por comando", () => {
    const aplicada = { migracaoNaMain: (rel) => rel.endsWith("20261029000000_init.sql") };
    const alvo = "supabase/migrations/20261029000000_init.sql";
    for (const cmd of [
      `sed -i s/a/b/ ${alvo}`,
      `git mv ${alvo} supabase/migrations/outro.sql`,
      `rm ${alvo}`,
      `echo "select 1;" >> ${alvo}`,
      `cd supabase && git rm migrations/20261029000000_init.sql`,
    ])
      expect(comando(cmd, aplicada), cmd).toContain("crie uma migração nova");
    expect(comando(`cat ${alvo}`, aplicada)).toBeNull();
    expect(comando(`sed -n 1,5p ${alvo}`, aplicada)).toBeNull();
    expect(comando("rm supabase/migrations/20270101000000_nova.sql", aplicada)).toBeNull();
  });

  it("funciona de ponta a ponta com a entrada que o Claude Code envia", () => {
    const entrada = (cmd) => ({ tool_name: "Bash", tool_input: { command: cmd } });
    const bloqueado = decisao(rodar("bloquear-comando.mjs", entrada("git push --force")));
    expect(bloqueado.permissionDecision).toBe("deny");
    expect(bloqueado.hookEventName).toBe("PreToolUse");
    const livre = rodar("bloquear-comando.mjs", entrada("npm test"));
    expect(livre.status).toBe(0);
    expect(livre.stdout).toBe("");
  });

  it("de ponta a ponta: lê o branch atual do repositório de verdade", () => {
    const { dir } = repositorio("main");
    const entrada = { tool_name: "Bash", cwd: dir, tool_input: { command: "git push" } };
    const r = decisao(rodar("bloquear-comando.mjs", entrada, { projeto: dir }));
    expect(r.permissionDecision).toBe("deny");
    expect(r.permissionDecisionReason).toContain("main");
  });

  it("continua valendo quando o projeto é alcançado por um atalho (symlink)", () => {
    const atalho = path.join(mkdtempSync(path.join(tmpdir(), "hook-atalho-")), "projeto");
    symlinkSync(raiz, atalho);
    const r = rodar(
      "bloquear-comando.mjs",
      { tool_name: "Bash", tool_input: { command: "git push --force" } },
      { caminho: path.join(atalho, ".claude/hooks/bloquear-comando.mjs"), projeto: atalho },
    );
    expect(decisao(r)?.permissionDecision).toBe("deny");
  });
});

describe("trava 2: migração já aplicada não se edita", () => {
  const jaNaMain = (rel) => rel.endsWith("20261029000000_init.sql");

  it("bloqueia editar migração que já está na main", () => {
    expect(migracao("supabase/migrations/20261029000000_init.sql", raiz, jaNaMain)).toContain(
      "crie uma migração nova",
    );
    expect(
      migracao(path.join(raiz, "supabase/migrations/20261029000000_init.sql"), raiz, jaNaMain),
    ).not.toBeNull();
  });

  it("deixa criar migração nova e editar qualquer outro arquivo", () => {
    expect(migracao("supabase/migrations/20270101000000_nova.sql", raiz, jaNaMain)).toBeNull();
    expect(migracao("src/lib/trips/draft.ts", raiz, jaNaMain)).toBeNull();
    expect(migracao("supabase/diagnostics/20261029000000_init.sql", raiz, jaNaMain)).toBeNull();
  });

  function comMigracao(ramoPrincipal) {
    const { dir, git } = repositorio(ramoPrincipal);
    mkdirSync(path.join(dir, "supabase/migrations"), { recursive: true });
    writeFileSync(path.join(dir, "supabase/migrations/1_antiga.sql"), "select 1;\n");
    git("add", ".");
    git("commit", "-q", "-m", "migração");
    git("checkout", "-q", "-b", "claude/x");
    writeFileSync(path.join(dir, "supabase/migrations/2_nova.sql"), "select 2;\n");
    return dir;
  }

  it("confere na main de verdade: a antiga é bloqueada, a nova do branch passa", () => {
    const dir = comMigracao("main");
    expect(migracao("supabase/migrations/1_antiga.sql", dir)).toContain("crie uma migração nova");
    expect(migracao("supabase/migrations/2_nova.sql", dir)).toBeNull();
    expect(migracao("supabase/migrations/3_ainda_nao_existe.sql", dir)).toBeNull();
  });

  it("sem a main para conferir, recusa mexer em migração que já existe", () => {
    const dir = comMigracao("outro-nome");
    expect(migracao("supabase/migrations/1_antiga.sql", dir)).toContain("git fetch origin main");
    expect(migracao("supabase/migrations/3_ainda_nao_existe.sql", dir)).toBeNull();
  });

  it("vale também quando o projeto é alcançado por um atalho (symlink)", () => {
    const dir = comMigracao("main");
    const atalho = path.join(mkdtempSync(path.join(tmpdir(), "hook-atalho-")), "projeto");
    symlinkSync(dir, atalho);
    expect(migracao(path.join(dir, "supabase/migrations/1_antiga.sql"), atalho)).not.toBeNull();
    expect(migracao(path.join(atalho, "supabase/migrations/1_antiga.sql"), dir)).not.toBeNull();
  });

  it("de ponta a ponta com a entrada do Edit e do Write", () => {
    const dir = comMigracao("main");
    for (const tool_name of ["Edit", "Write"]) {
      const entrada = (arquivo) => ({ tool_name, cwd: dir, tool_input: { file_path: arquivo } });
      const antiga = path.join(dir, "supabase/migrations/1_antiga.sql");
      const r = rodar("proteger-migracoes.mjs", entrada(antiga), { projeto: dir });
      expect(decisao(r).permissionDecision).toBe("deny");
      const nova = path.join(dir, "supabase/migrations/2_nova.sql");
      expect(rodar("proteger-migracoes.mjs", entrada(nova), { projeto: dir }).stdout).toBe("");
    }
  });
});

describe("trava 3: workflows que só o dono dispara", () => {
  const disparar = (workflow_id, ref = "main") =>
    workflow({ method: "run_workflow", workflow_id, ref });

  it.each([
    "supabase-restore.yml",
    "supabase-auth.yml",
    "supabase-setup-jobs.yml",
    "supabase-migrate.yml",
    "Supabase-Restore.yml",
    "12345678",
    12345678,
    "workflow-que-nao-conheco.yml",
  ])("bloqueia %s", (w) => {
    expect(disparar(w)).toContain("só o dono");
  });

  it("bloqueia workflow do Supabase fora da main", () => {
    expect(disparar("supabase-diagnostico.yml", "claude/x")).toContain("main");
    expect(disparar("supabase-backup.yml", "refs/heads/claude/x")).toContain("main");
  });

  it("deixa passar diagnóstico e backup na main, a CI em qualquer branch, e cancelar ou repetir", () => {
    expect(disparar("supabase-diagnostico.yml")).toBeNull();
    expect(disparar("supabase-backup.yml")).toBeNull();
    expect(disparar("supabase-diagnostico.yml", "refs/heads/main")).toBeNull();
    expect(disparar("ci.yml", "claude/x")).toBeNull();
    expect(disparar("codeql.yml", "claude/x")).toBeNull();
    expect(workflow({ method: "cancel_workflow_run", run_id: 1 })).toBeNull();
    expect(workflow({ method: "rerun_failed_jobs", run_id: 1 })).toBeNull();
  });

  it("de ponta a ponta com a entrada da ferramenta do GitHub", () => {
    const entrada = (workflow_id) => ({
      tool_name: "mcp__github__actions_run_trigger",
      tool_input: { method: "run_workflow", owner: "o", repo: "r", workflow_id, ref: "main" },
    });
    const r = rodar("bloquear-workflow.mjs", entrada("supabase-restore.yml"));
    expect(decisao(r).permissionDecision).toBe("deny");
    expect(rodar("bloquear-workflow.mjs", entrada("supabase-diagnostico.yml")).stdout).toBe("");
  });
});

describe("trava 4: pacote novo do npm", () => {
  const conhecidos = new Set(["next", "zod", "@supabase/ssr", "vitest", "typescript"]);
  const binarios = new Set(["tsc", "vitest", "next"]);
  const agora = Date.parse("2026-11-27T00:00:00Z");
  const registro = { lodash: "2012-04-23T00:00:00Z", "novo-demais": "2026-11-25T00:00:00Z" };
  const consulta = (nome) => registro[nome] ?? null;

  it("acha os pacotes que o comando instalaria e que não estão no package.json", () => {
    expect(pacotesNovos("npm install lodash zod@4", conhecidos)).toEqual(["lodash"]);
    expect(pacotesNovos("npm i -D @types/lodash@^4 && npm test", conhecidos)).toEqual([
      "@types/lodash",
    ]);
    expect(pacotesNovos("npx cowsay oi", conhecidos)).toEqual(["cowsay"]);
    expect(pacotesNovos("npx vitest run", conhecidos)).toEqual([]);
    expect(pacotesNovos("npm ci && npm run build", conhecidos)).toEqual([]);
    expect(pacotesNovos("npm install", conhecidos)).toEqual([]);
    expect(pacotesNovos("npm install -g npm@11.10.0", conhecidos)).toEqual([]);
  });

  it.each([
    "npm run lint\nnpm install lodash",
    "npm install 'lodash'",
    "(npm install lodash)",
    "/usr/bin/npm install lodash",
    "npm --prefix web install lodash",
    "npm install zod@npm:lodash",
    "npx -p lodash algum-comando",
    "pnpm add lodash",
    "yarn add lodash",
  ])("acha o pacote também em: %s", (cmd) => {
    expect(pacotesNovos(cmd, conhecidos)).toEqual(["lodash"]);
  });

  it("programa que já está instalado no projeto não é pacote novo", () => {
    expect(analisar("npx tsc --noEmit", conhecidos, binarios).novos).toEqual([]);
    expect(analisar("npx tsc --noEmit", conhecidos, new Set()).novos).toEqual(["tsc"]);
    expect(pacotesNovos("npm run install", conhecidos)).toEqual([]);
  });

  it("origem fora do registro do npm pede a aprovação do dono", () => {
    for (const cmd of [
      "npm install usuario/repositorio",
      "npm install github:usuario/repositorio",
      "npm install https://exemplo.com/pacote.tgz",
      "npm install ./pacote-local.tgz",
      "npm install lodash --registry https://outro.exemplo.com",
    ]) {
      const a = analisar(cmd, conhecidos);
      expect(a.outros.length, cmd).toBeGreaterThan(0);
      expect(pacote(a, consulta, agora), cmd).toMatchObject({ decisao: "ask" });
    }
  });

  it("comando que desliga a quarentena ou liga os scripts de instalação pede aprovação", () => {
    for (const cmd of [
      "npm install --min-release-age=0",
      "npm ci --ignore-scripts=false",
      "npm rebuild --no-ignore-scripts",
      "npm_config_ignore_scripts=false npm ci",
      "npm config set min-release-age 0",
    ]) {
      const r = pacote(analisar(cmd, conhecidos), consulta, agora);
      expect(r, cmd).toMatchObject({ decisao: "ask" });
      expect(r.motivo, cmd).toContain("proteção");
    }
    expect(pacote(analisar("npm ci --no-audit --no-fund", conhecidos), consulta, agora)).toBeNull();
  });

  it("bloqueia pacote que não existe e pacote criado há menos de 7 dias", () => {
    expect(pacote(["pacote-inventado"], consulta, agora)).toMatchObject({ decisao: "deny" });
    expect(pacote(["novo-demais"], consulta, agora)).toMatchObject({ decisao: "deny" });
  });

  it("sem resposta do registro, bloqueia e diz que foi falha de consulta", () => {
    const r = pacote(["lodash"], () => INDISPONIVEL, agora);
    expect(r.decisao).toBe("deny");
    expect(r.motivo).toContain("Não consegui consultar");
    expect(r.motivo).not.toContain("inventado");
  });

  it("pacote antigo que ainda não está no projeto pede a aprovação do dono", () => {
    expect(pacote(["lodash"], consulta, agora)).toMatchObject({ decisao: "ask" });
  });

  it("sem pacote novo, não interfere", () => {
    expect(pacote([], consulta, agora)).toBeNull();
  });

  it("de ponta a ponta: a decisão de pedir aprovação sai no formato do Claude Code", () => {
    const entrada = (command) => ({ tool_name: "Bash", tool_input: { command } });
    // Origem fora do registro: decide sem consultar a internet.
    const r = decisao(rodar("pacote-novo.mjs", entrada("npm install usuario/repositorio")));
    expect(r.permissionDecision).toBe("ask");
    expect(r.hookEventName).toBe("PreToolUse");
    expect(rodar("pacote-novo.mjs", entrada("npx vitest run")).stdout).toBe("");
  });
});

describe("trava 5: só termina o turno com a verificação verde", () => {
  function projeto(saidaDoVerificar) {
    const { dir } = repositorio();
    mkdirSync(path.join(dir, "node_modules"));
    mkdirSync(path.join(dir, "scripts"));
    writeFileSync(path.join(dir, ".gitignore"), "node_modules\n");
    // O verificador de mentira anota cada vez que roda, numa pasta ignorada.
    writeFileSync(
      path.join(dir, "scripts/verificar.sh"),
      `echo x >> node_modules/rodadas; echo "rodou"; exit ${saidaDoVerificar}\n`,
    );
    return dir;
  }
  const parar = (dir) =>
    spawnSync("node", [hook("verificar-ao-parar.mjs")], {
      input: JSON.stringify({ hook_event_name: "Stop", cwd: dir }),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    });
  const rodadas = (dir) =>
    readFileSync(path.join(dir, "node_modules/rodadas"), "utf8").trim().split("\n").length;

  it("verificação vermelha: bloqueia com código 2 e devolve a saída ao agente", () => {
    const r = parar(projeto(1));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("A verificação rápida falhou (tentativa 1 de 3)");
    expect(r.stderr).toContain("rodou");
  });

  it("depois de 3 bloqueios seguidos, libera o turno e avisa o dono na tela", () => {
    const dir = projeto(1);
    expect([parar(dir), parar(dir), parar(dir)].map((r) => r.status)).toEqual([2, 2, 2]);
    const quarta = parar(dir);
    expect(quarta.status).toBe(0);
    // A mensagem para o dono vai no campo que o Claude Code mostra na tela.
    expect(JSON.parse(quarta.stdout).systemMessage).toContain("NÃO está verificado");
    // Sem mudança no código, o turno seguinte não é bloqueado de novo, mas o aviso se repete.
    const quinta = parar(dir);
    expect(quinta.status).toBe(0);
    expect(JSON.parse(quinta.stdout).systemMessage).toContain("NÃO está verificado");
    expect(rodadas(dir)).toBe(4);
    // Mudou o código: volta a verificar e a bloquear.
    writeFileSync(path.join(dir, "novo.txt"), "x");
    expect(parar(dir).status).toBe(2);
  });

  it("verificação verde: libera, e não roda de novo se nada mudou", () => {
    const dir = projeto(0);
    expect(parar(dir).status).toBe(0);
    const marca = path.join(dir, "node_modules/.cache/verificar/ultimo-ok");
    expect(readFileSync(marca, "utf8")).toMatch(/^[0-9a-f]{64}$/);
    // Mudança só em pasta ignorada: o código é o mesmo, o hook não roda de novo.
    writeFileSync(path.join(dir, "node_modules/qualquer-coisa"), "x");
    const semMudanca = parar(dir);
    expect(semMudanca.status).toBe(0);
    expect(semMudanca.stderr).toBe("");
    expect(rodadas(dir)).toBe(1);
  });

  it("arquivo novo ainda não versionado conta como mudança e é verificado", () => {
    const dir = projeto(0);
    expect(parar(dir).status).toBe(0);
    // O verificador passa a falhar; ele próprio é um arquivo novo, não versionado.
    writeFileSync(path.join(dir, "scripts/verificar.sh"), 'echo "rodou de novo"; exit 1\n');
    const depois = parar(dir);
    expect(depois.status).toBe(2);
    expect(depois.stderr).toContain("rodou de novo");
  });
});

describe("trava 6: arquivos de segredo", () => {
  it.each([".env", ".env.local", "/projeto/.env.production", "apps/web/.env.test", ".env.x.local"])(
    "bloqueia ler ou escrever %s",
    (arquivo) => {
      expect(segredo(arquivo)).toContain(".env");
    },
  );

  it.each([".env.example", "src/lib/env.ts", "docs/ambiente.env.md", "README.md", undefined])(
    "deixa passar %s",
    (arquivo) => {
      expect(segredo(arquivo)).toBeNull();
    },
  );

  it("de ponta a ponta com a entrada do Read e do Write", () => {
    for (const tool_name of ["Read", "Write", "Edit"]) {
      const entrada = (file_path) => ({ tool_name, tool_input: { file_path } });
      const r = rodar("proteger-segredos.mjs", entrada(path.join(raiz, ".env.staging")));
      expect(decisao(r).permissionDecision).toBe("deny");
      const livre = rodar("proteger-segredos.mjs", entrada(path.join(raiz, ".env.example")));
      expect(livre.stdout).toBe("");
    }
  });
});

describe("permissões negadas ao agente", () => {
  const settings = JSON.parse(readFileSync(path.join(raiz, ".claude/settings.json"), "utf8"));

  it.each([
    "mcp__github__merge_pull_request",
    "mcp__github__enable_pr_auto_merge",
    "mcp__github__push_files",
    "mcp__github__create_or_update_file",
    "mcp__github__delete_file",
  ])("%s", (ferramenta) => {
    expect(settings.permissions.deny).toContain(ferramenta);
  });

  it("toda trava de ferramenta está ligada à ferramenta certa", () => {
    const ligacoes = Object.fromEntries(
      settings.hooks.PreToolUse.map((g) => [
        g.matcher,
        g.hooks.map((h) => /hooks\/([\w.-]+)/.exec(h.command)[1]),
      ]),
    );
    expect(ligacoes).toEqual({
      Bash: ["bloquear-comando.mjs", "pacote-novo.mjs"],
      "Read|Edit|Write": ["proteger-segredos.mjs"],
      "Edit|Write": ["proteger-migracoes.mjs"],
      mcp__github__actions_run_trigger: ["bloquear-workflow.mjs"],
    });
  });
});
