import { describe, expect, it } from "vitest";
import { orderTables, restoreSql, safeError } from "./supabase-backup-lib.mjs";

describe("backup do banco", () => {
  it("restaura auth antes e pais antes dos filhos", () => {
    const tables = [
      { schema: "public", name: "flights" },
      { schema: "auth", name: "identities" },
      { schema: "public", name: "bookings" },
      { schema: "auth", name: "users" },
      { schema: "public", name: "profiles" },
    ];
    const fks = [
      { child: "flights", parent: "bookings" },
      { child: "bookings", parent: "profiles" },
    ];
    expect(orderTables(tables, fks).map((t) => `${t.schema}.${t.name}`)).toEqual([
      "auth.users",
      "auth.identities",
      "public.profiles",
      "public.bookings",
      "public.flights",
    ]);
  });

  it("gera upsert pela chave primária no public e só insere no auth", () => {
    const pub = restoreSql(
      { schema: "public", name: "app_config", columns: ["key", "value"], pk: ["key"] },
      [{ key: "a", value: "it's" }],
      "t1",
    );
    expect(pub).toContain('insert into "public"."app_config" ("key", "value")');
    expect(pub).toContain('$t1$[{"key":"a","value":"it\'s"}]$t1$::json');
    expect(pub).toContain('on conflict ("key") do update set "value" = excluded."value"');
    const auth = restoreSql(
      { schema: "auth", name: "users", columns: ["id"], pk: ["id"] },
      [{ id: "x" }],
      "t2",
    );
    expect(auth).toContain("on conflict do nothing");
    expect(() =>
      restoreSql({ schema: "public", name: "x", columns: ["v"], pk: [] }, [{ v: "$t3$" }], "t3"),
    ).toThrow();
  });

  it("tira valores das mensagens de erro antes de ir para o log público", () => {
    const msg = safeError(
      new Error(
        'ERROR: duplicate key value violates unique constraint "u" DETAIL: Key (email)=(a@b.com) already exists.',
      ),
    );
    expect(msg).not.toContain("a@b.com");
    expect(msg).toContain("duplicate key");
    expect(safeError(new Error("Key (id)=(123) fulano@x.com.br LINE 1: insert ..."))).toBe(
      "Key (…)=(…) <e-mail>",
    );
  });
});
