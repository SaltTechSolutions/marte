# Marte — depo kökü

Bu dosya yalnızca depo geneline ait yönlendirmeyi taşır. Asıl geliştirme
kuralları paket başına, çalıştığın dizinin yanında durur:

| Nerede çalışıyorsan | Oku |
|---|---|
| `apps/gymentra-mobile/` | `AGENTS.md` — Expo/RN kuralları, mimari, build ve doğrulama |
| `backend/` | `CLAUDE.md` — Cloud Functions, kurallar, deploy |
| `packages/rig/` | `CLAUDE.md` — hareket motoru ve kukla editörü |
| tek takip kaynağı | `docs/plan.md` — açık işler, kararlar, yayın durumu |

`apps/gymentra-site/` statik site (gizlilik, şartlar, hesap silme); git'ten
değil, `npx wrangler pages deploy` ile yayınlanıyor.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
