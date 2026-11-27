import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { avaliar as comando } from "../.claude/hooks/bloquear-comando.mjs";
import { avaliar as workflow } from "../.claude/hooks/bloquear-workflow.mjs";
import { avaliar as pacote, pacotesNovos } from "../.claude/hooks/pacote-novo.mjs";
import { avaliar as migracao } from "../.claude/hooks/proteger-migracoes.mjs";

// Cada trava do agente tem aqui pelo menos um caso que deve bloquear e um que
// deve passar. Se uma trava for afrouxada sem querer, este teste falha.
const raiz = path.join(import.meta.dirname, "..");
const hook = (nome) => path.join(raiz, ".claude", "hooks", nome);

describe("trava 1: comandos proibidos", () => {
  it.each([
    ["git push --force origin claude/x", "forçado"],
    ["git push -f", "forçado"],
    ["git -C /repo push origin HEAD:main", "main"],
    ["git push origin main", "main"],
    ["rm -rf .git", "recursiva"],
    ["sh -c '/bin/rm -fr supabase/migrations/'", "recursiva"],
    ["rm -r src", "recursiva"],
    ["cat .env.local", ".env"],
    ["grep KEY .env", ".env"],
    ["cp .env.production /tmp/x", ".env"],
    ["curl -H 'authorization: x' https://api.supabase.com/v1/projects", "banco de produção"],
    ["gh workflow run supabase-restore.yml -f confirmar=RESTAURAR", "só o dono"],
  ])("bloqueia: %s", (cmd, trecho) => {
    expect(comando(cmd)).toContain(trecho);
  });

  it.each([
    "git push -u origin claude/kind-hopper-fato5t",
    "git push --force-with-lease -u origin claude/kind-hopper-fato5t",
    "git fetch origin main && git merge --no-edit FETCH_HEAD",
    "rm -rf node_modules/.cache .next",
    "rm scripts/velho.mjs",
    "cat .env.example",
    "npm run verify",
    "gh workflow run supabase-diagnostico.yml -f alvo=estado-schema.sql",
    "git log --oneline main..HEAD",
  ])("deixa passar: %s", (cmd) => {
    expect(comando(cmd)).toBeNull();
  });

  it("funciona de ponta a ponta com a entrada que o Claude Code envia", () => {
    const rodar = (cmd) =>
      spawnSync("node", [hook("bloquear-comando.mjs")], {
        input: JSON.stringify({ tool_name: "Bash", tool_input: { command: cmd } }),
        encoding: "utf8",
      });
    const bloqueado = JSON.parse(rodar("git push --force").stdout);
    expect(bloqueado.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(bloqueado.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    const livre = rodar("npm test");
    expect(livre.status).toBe(0);
    expect(livre.stdout).toBe("");
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
});

describe("trava 3: workflows que só o dono dispara", () => {
  it.each([
    "supabase-restore.yml",
    "supabase-auth.yml",
    "supabase-setup-jobs.yml",
    "supabase-migrate.yml",
  ])("bloqueia %s", (w) => {
    expect(workflow({ method: "run_workflow", workflow_id: w, ref: "main" })).toContain(
      "só o dono",
    );
  });

  it("bloqueia workflow do Supabase fora da main", () => {
    expect(
      workflow({
        method: "run_workflow",
        workflow_id: "supabase-diagnostico.yml",
        ref: "claude/x",
      }),
    ).toContain("main");
  });

  it("deixa passar diagnóstico e backup na main, e cancelar ou repetir execuções", () => {
    const naMain = (w) => workflow({ method: "run_workflow", workflow_id: w, ref: "main" });
    expect(naMain("supabase-diagnostico.yml")).toBeNull();
    expect(naMain("supabase-backup.yml")).toBeNull();
    expect(workflow({ method: "cancel_workflow_run", run_id: 1 })).toBeNull();
    expect(workflow({ method: "rerun_failed_jobs", run_id: 1 })).toBeNull();
  });
});

describe("trava 4: pacote novo do npm", () => {
  const conhecidos = new Set(["next", "zod", "@supabase/ssr", "vitest"]);
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

  it("bloqueia pacote que não existe e pacote criado há menos de 7 dias", () => {
    expect(pacote(["pacote-inventado"], consulta, agora)).toMatchObject({ decisao: "deny" });
    expect(pacote(["novo-demais"], consulta, agora)).toMatchObject({ decisao: "deny" });
  });

  it("pacote antigo que ainda não está no projeto pede a aprovação do dono", () => {
    expect(pacote(["lodash"], consulta, agora)).toMatchObject({ decisao: "ask" });
  });

  it("sem pacote novo, não interfere", () => {
    expect(pacote([], consulta, agora)).toBeNull();
  });
});

describe("trava 5: só termina o turno com a verificação verde", () => {
  function projeto(saidaDoVerificar) {
    const dir = mkdtempSync(path.join(tmpdir(), "hook-parar-"));
    const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
    mkdirSync(path.join(dir, "node_modules"));
    mkdirSync(path.join(dir, "scripts"));
    writeFileSync(path.join(dir, ".gitignore"), "node_modules\n");
    writeFileSync(
      path.join(dir, "scripts/verificar.sh"),
      `echo "rodou"; exit ${saidaDoVerificar}\n`,
    );
    git("init", "-q");
    git(
      "-c",
      "user.email=t@t",
      "-c",
      "user.name=t",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "inicio",
    );
    return dir;
  }
  const parar = (dir) =>
    spawnSync("node", [hook("verificar-ao-parar.mjs")], {
      input: JSON.stringify({ hook_event_name: "Stop", cwd: dir }),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    });

  it("verificação vermelha: bloqueia com código 2 e devolve a saída ao agente", () => {
    const r = parar(projeto(1));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("A verificação rápida falhou (tentativa 1 de 3)");
    expect(r.stderr).toContain("rodou");
  });

  it("depois de 3 bloqueios seguidos, libera o turno e manda avisar o dono", () => {
    const dir = projeto(1);
    expect([parar(dir), parar(dir), parar(dir)].map((r) => r.status)).toEqual([2, 2, 2]);
    const quarta = parar(dir);
    expect(quarta.status).toBe(0);
    expect(quarta.stderr).toContain("Turno liberado");
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
