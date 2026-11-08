# E2E Test Infra: MECAFUT 2026 Core Fixes & Enhancements

## Test Philosophy
- Opaque-box, requirement-driven. Derived strictly from user requirements in `ORIGINAL_REQUEST.md` and public contracts in `PROJECT.md`.
- Zero coupling to implementation internals. Tests exercise exported functions, data structures, and CLI/API contracts.
- Progressive testability: Verification mechanisms use straightforward assertions and deterministic test fixtures.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial + Real-World Workloads.

## Feature Inventory & Test Coverage Mapping
| # | Feature | Source (requirement) | Tier 1 (>=5) | Tier 2 (>=5) | Tier 3 (Pairwise) | Tier 4 (Workloads) |
|---|---------|---------------------|:------------:|:------------:|:-----------------:|:------------------:|
| F1 | Teléfono del Capitán en DB | ORIGINAL_REQUEST §1 | 5 | 5 | ✓ | ✓ |
| F2 | Estabilidad Realtime en /torneo | ORIGINAL_REQUEST §6 | 5 | 5 | ✓ | ✓ |
| F3 | Configuración General & WhatsApp | ORIGINAL_REQUEST §7 | 5 | 5 | ✓ | ✓ |
| F4 | Helpers de Estado y Elegibilidad | ORIGINAL_REQUEST §4 | 5 | 5 | ✓ | ✓ |
| F5 | Plantilla Excel Profesional | ORIGINAL_REQUEST §2 | 5 | 5 | ✓ | ✓ |
| F6 | Teléfono en Exportación Excel | ORIGINAL_REQUEST §1 | 5 | 5 | ✓ | ✓ |
| F7 | Fix Pérdida de Carnet (David Díaz) | ORIGINAL_REQUEST §3 | 5 | 5 | ✓ | ✓ |
| F8 | Regla de 8 Carnets en /equipo | ORIGINAL_REQUEST §4 | 5 | 5 | ✓ | ✓ |
| F9 | Enlace Dinámico WhatsApp en Vistas | ORIGINAL_REQUEST §7 | 5 | 5 | ✓ | ✓ |
| F10 | Subida/Edición Carnet en /admin | ORIGINAL_REQUEST §4 | 5 | 5 | ✓ | ✓ |
| F11 | Filtro de 8 Carnets en Llaves | ORIGINAL_REQUEST §4 | 5 | 5 | ✓ | ✓ |
| F12 | Armado Manual Llaves (12-BYEs/3-Triang) | ORIGINAL_REQUEST §5 | 5 | 5 | ✓ | ✓ |
| F13 | Editor WhatsApp en /admin | ORIGINAL_REQUEST §7 | 5 | 5 | ✓ | ✓ |
| F14 | Verificación E2E y Local Build | ORIGINAL_REQUEST §Restr | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **Runner**: Node.js test runner `node tests/e2e/runner.mjs`.
- **Location**: `tests/e2e/`.
- **Pass/Fail Semantics**: Exit code 0 on all tests passing, non-zero on failure. Full assertion reporting per Tier.
- **Directory Layout**:
  - `tests/e2e/runner.mjs`: Central runner and reporter.
  - `tests/e2e/tier1_features.test.mjs`: Tier 1 Feature Coverage (happy path, isolation).
  - `tests/e2e/tier2_boundaries.test.mjs`: Tier 2 Boundary & Corner Cases (limits, empty inputs, formatting extremes).
  - `tests/e2e/tier3_pairwise.test.mjs`: Tier 3 Cross-Feature Interactions.
  - `tests/e2e/tier4_workloads.test.mjs`: Tier 4 End-to-End Tournament Lifecycle Scenarios.

## Coverage Thresholds
- Tier 1: ≥5 test cases per feature (14 features × 5 = ≥70 tests)
- Tier 2: ≥5 boundary test cases per feature (14 features × 5 = ≥70 tests)
- Tier 3: ≥14 pairwise interaction tests covering state & data flow
- Tier 4: ≥7 realistic end-to-end application scenarios
- **Total Minimum Test Cases**: ≥161 test cases

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Registro completo de equipo con teléfono internacional (+504 9474-4365) y verificación de exportación Excel con anchos y tipo texto | F1, F5, F6 | High |
| 2 | Registro de plantilla con carga concurrente de carnets adicionales asegurando persistencia de foto y estado Aprobado (Anti-David Díaz) | F1, F4, F7 | High |
| 3 | Evaluación de elegibilidad de equipo: 7 jugadores con carnet + 1 sin carnet (no apto) -> actualización de carnet desde admin -> apto (8 con carnet) | F4, F8, F10, F11 | High |
| 4 | Docente autorizado registrado en plantilla: validación de exención de carnet y cómputo válido para el cupo mínimo de 8 jugadores | F4, F8, F11 | Medium |
| 5 | Armado manual completo de torneo masculino de 12 equipos: asignación de 4 BYEs a cuartos y 4 cruces preliminares con validación de no duplicados | F11, F12 | High |
| 6 | Armado manual de triangular femenino de 3 equipos con cálculo de tabla de posiciones y pase a Gran Final | F11, F12 | Medium |
| 7 | Actualización de enlace de WhatsApp desde admin con verificación de persistencia en configuracion y propagación a vistas públicas | F3, F9, F13 | Medium |
| 8 | Simulación de múltiples suscriptores simultáneos a canal Realtime (Navbar + /torneo) sin colisión ni excepciones, con fallback | F2 | High |
