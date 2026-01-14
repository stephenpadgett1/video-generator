# Maple Port: Einstein-Maxwell Cylindrical Symmetry

## Status: Complete - Ready to Commit

All implementation and documentation complete.

## Task

Commit and push the Maple port to the repository.

## Files to Commit

```
em_cylindrical_maple/
├── EMCylindrical.mpl
├── README.md
├── lib/
│   ├── EinsteinRosenMetric.mpl
│   ├── FieldTensor.mpl
│   ├── EnergyTensor.mpl
│   └── WaveEquation.mpl
├── solutions/
│   ├── CaseISolution.mpl
│   ├── CaseIISolution.mpl
│   └── CaseIIISolution.mpl
├── helpers/
│   ├── CurrentDensity.mpl
│   └── CylindricalBoundary.mpl
└── tests/
    └── test_core.mpl
```

## Scope

### Files to Port (Symbolic - SymPy-based)

| Python File | Maple Target | Key Operations |
|-------------|--------------|----------------|
| `metric.py` | `EinsteinRosenMetric.mpl` | 4×4 metric tensor, Christoffel symbols |
| `field_tensor.py` | `FieldTensor.mpl` | F_μν from potentials φ, ψ |
| `energy_tensor.py` | `EnergyTensor.mpl` | E^β_α energy-momentum tensor |
| `wave_equation.py` | `WaveEquation.mpl` | Bessel function wave solutions |
| `solutions/case_i.py` | `CaseISolution.mpl` | φ=0 solutions (3 variants) |
| `solutions/case_ii.py` | `CaseIISolution.mpl` | ψ=0 solutions (4 variants) |
| `solutions/case_iii.py` | `CaseIIISolution.mpl` | Both φ,ψ≠0 (4 variants) |
| `current.py` | `CurrentDensity.mpl` | J^μ current density |
| `boundary.py` | `CylindricalBoundary.mpl` | Surface currents at ρ=R |

### Files NOT Ported (Numerical - NumPy/SciPy only)

- `wave_conversion/*.py` - Purely numerical (finite differences, no symbolic)
- `junction/*.py` - Purely numerical tensor operations
- `sources.py` - Numerical current profiles

## Proposed Directory Structure

```
em_cylindrical_maple/
├── EMCylindrical.mpl           # Main package loader
├── lib/
│   ├── EinsteinRosenMetric.mpl
│   ├── FieldTensor.mpl
│   ├── EnergyTensor.mpl
│   └── WaveEquation.mpl
├── solutions/
│   ├── CaseISolution.mpl
│   ├── CaseIISolution.mpl
│   └── CaseIIISolution.mpl
├── helpers/
│   ├── CurrentDensity.mpl
│   └── CylindricalBoundary.mpl
└── tests/
    ├── test_metric.mpl
    ├── test_solutions.mpl
    └── test_field_equations.mpl
```

## SymPy → Maple Translation Reference

| SymPy | Maple |
|-------|-------|
| `sp.symbols('rho', real=True, positive=True)` | `assume(rho > 0)` |
| `sp.diff(expr, x)` | `diff(expr, x)` |
| `sp.exp(x)` | `exp(x)` |
| `sp.log(x)` | `ln(x)` |
| `sp.besselj(0, x)` | `BesselJ(0, x)` |
| `sp.bessely(0, x)` | `BesselY(0, x)` |
| `sp.tanh(x)`, `sp.cosh(x)` | `tanh(x)`, `cosh(x)` |
| `sp.Matrix([[...]])` | `Matrix([[...]])` |
| `M.det()` | `LinearAlgebra[Determinant](M)` |
| `sp.simplify(expr)` | `simplify(expr)` |
| `sp.Rational(1, 2)` | `1/2` |
| `sp.lambdify((x,y), expr)` | `proc(x,y) subs(...); evalf(%); end` |

## Implementation Tasks

### Phase 1: Core Infrastructure
1. Create directory structure
2. Implement `EinsteinRosenMetric.mpl`
   - `Create(lambda_expr, mu_expr)` - build symbolic metric
   - `MetricAt(metric, rho, t)` - numerical evaluation
   - `InverseMetricAt(metric, rho, t)` - inverse metric
   - `ComputeChristoffel(metric)` - Γ^i_jk symbols
3. Implement `FieldTensor.mpl`
   - `Create(phi_expr, psi_expr)` - build F_μν
   - `At(tensor, rho, t)` - numerical evaluation
   - `Invariants(tensor, rho, t, g_inv)` - scalar invariants
4. Implement `EnergyTensor.mpl`
   - `Create(phi, psi, mu, lambda)` - build E^β_α
   - `At(tensor, rho, t)` - numerical evaluation
   - `Trace(tensor, rho, t)` - trace (should be ~0)

### Phase 2: Wave Equation
5. Implement `WaveEquation.mpl`
   - `CreateStandingWave(k, A)` - J₀(kρ)cos(kt)
   - `CreateSuperposition(modes)` - sum of modes
   - `VerifyWaveEquation(sol, rho, t)` - check residual

### Phase 3: Solution Classes
6. Implement `CaseISolution.mpl` (φ = 0)
   - Variants: `bessel`, `t_only`, `rho_only`
   - Equations 30, 43, 44 from paper
7. Implement `CaseIISolution.mpl` (ψ = 0)
   - Variants: `rho_only`, `t_only`, `rho_quadratic`, `t_linear`
   - Equations 56-59
8. Implement `CaseIIISolution.mpl` (both non-zero)
   - Variants: `variant_71`, `variant_72`, `variant_73`, `variant_78`
   - Equations 71-78

### Phase 4: Helper Modules
9. Implement `CurrentDensity.mpl`
10. Implement `CylindricalBoundary.mpl`

### Phase 5: Testing & Validation
11. Port test cases from `tests/test_core.py`
12. Cross-validate numerical results against Python

## Example Target API

```maple
with(EMCylindrical):

# Create a Case I Bessel solution
sol := CaseISolution:-Create(1.0, 0.5, variant="bessel", k=1.0, A=0.5);

# Evaluate potentials at (ρ=2, t=1)
psi_val := CaseISolution:-Psi(sol, 2.0, 1.0);
mu_val := CaseISolution:-Mu(sol, 2.0, 1.0);

# Get 4×4 metric tensor
g := CaseISolution:-MetricAt(sol, 2.0, 1.0);

# Verify field equations (residuals should be ~0)
residuals := CaseISolution:-VerifyFieldEquations(sol, 2.0, 1.0);

# Access symbolic expressions directly
print("Symbolic ψ:", sol:-psi_symbolic);
```

## Key Considerations

- **Indexing**: Python is 0-based, Maple is 1-based (adjust all array access)
- **Numerical evaluation**: Use `evalf(subs({rho=val, t=val}, expr))` pattern
- **Assumptions**: Use `assume(rho > 0)` for physical constraints
- **Performance**: Consider `Compiler:-Compile` for intensive numerical loops

## Verification

1. Each module should pass unit tests matching Python behavior
2. Field equation residuals should be < 1e-10 for all solution variants
3. Cross-validate at least 10 test points per solution against Python output
