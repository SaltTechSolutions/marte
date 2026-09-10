# Antrenman Simülatörü

Hareket figürünün motoru, kare editörü ve mekanik denetimi. Proje bilgisi
`README.md`'de, ertelenen işler `TODOS.md`'de; burada yalnızca ajan
yönlendirmesi var.

**Oturum başında** `../../docs/KARAR-DEFTERI.md`'nin en üstteki üç kaydını
oku — bu paketin kararlarının yarısı orada, yarısı `TODOS.md`'de. Kod
değiştiren oturumun sonunda deftere kayıt ekle.

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
