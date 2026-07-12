#!/usr/bin/env python3
"""Generate 50 Briggs/OpenStax problems per topic with sympy answers."""

from __future__ import annotations

import json
import re
from fractions import Fraction
from pathlib import Path

import sympy as sp

x, t, u, y, s, z, w, m, r, v = sp.symbols("x t u y s z w m r v")
TOPICS = [
    "fundamentals",
    "area",
    "volumes",
    "centroids",
    "arc",
    "surface",
    "inertia",
    "applications",
]
PER_TOPIC = 50
# Strict per-topic mix: 20 easy + 20 medium + 10 hard = 50
DIFFICULTY_EASY = 20
DIFFICULTY_MEDIUM = 20
DIFFICULTY_HARD = 10


def difficulty_for_index(i: int) -> str:
    """Map problem index 0..49 → difficulty with fixed 20/20/10 ratio."""
    if i < DIFFICULTY_EASY:
        return "easy"
    if i < DIFFICULTY_EASY + DIFFICULTY_MEDIUM:
        return "medium"
    return "hard"


def difficulty_tier(diff: str) -> int:
    """0 = easy, 1 = medium, 2 = hard — scale coefficients / setup complexity."""
    return {"easy": 0, "medium": 1, "hard": 2}[diff]


# Strict Calc-1/2 rule: never leave hyperbolic functions in student-facing latex.
_HYPERBOLIC_FUNCS = (
    sp.sinh, sp.cosh, sp.tanh, sp.coth, sp.sech, sp.csch,
    sp.asinh, sp.acosh, sp.atanh, sp.acoth, sp.asech, sp.acsch,
)


def strip_hyperbolic_expr(expr):
    """Rewrite sinh/cosh/asinh/… into log/exp elementary forms when possible."""
    try:
        e = sp.simplify(expr)
    except Exception:
        e = expr
    if not hasattr(e, "has"):
        return e
    try:
        if not e.has(*_HYPERBOLIC_FUNCS):
            return e
    except Exception:
        return e
    # Prefer a real branch when sympy returns a piecewise complex/hyperbolic form
    if isinstance(e, sp.Piecewise):
        for piece, _cond in e.args:
            try:
                p = strip_hyperbolic_expr(piece)
                if not (hasattr(p, "has") and p.has(*_HYPERBOLIC_FUNCS)):
                    return p
            except Exception:
                continue
    for rewriter in (sp.log, sp.exp):
        try:
            e2 = sp.simplify(e.rewrite(rewriter))
            if not e2.has(*_HYPERBOLIC_FUNCS):
                return e2
            e = e2
        except Exception:
            pass
    return e


# Every sp.latex call must strip hyperbolics — answers/finalAnswer often use sp.latex directly.
_orig_sp_latex = sp.latex


def polish_student_latex(s: str) -> str:
    """Map sympy latex quirks to Calc-1 textbook forms."""
    s = str(s)
    # Sympy emits \operatorname{asin}; textbooks use \arcsin / \arctan.
    for a, b in (
        (r"\operatorname{asin}", r"\arcsin"),
        (r"\operatorname{acos}", r"\arccos"),
        (r"\operatorname{atan}", r"\arctan"),
        (r"\operatorname{asec}", r"\arcsec"),
        (r"\operatorname{acsc}", r"\arccsc"),
        (r"\operatorname{acot}", r"\arccot"),
    ):
        s = s.replace(a, b)
    return s


def sympy_latex(expr, var=None) -> str:
    e = strip_hyperbolic_expr(expr)
    if var is not None:
        s = _orig_sp_latex(e, symbol_names={var: str(var)})
    else:
        s = _orig_sp_latex(e)
    return polish_student_latex(s)


def _latex_no_hyperbolic(expr, *args, **kwargs):
    try:
        if hasattr(expr, "has"):
            expr = strip_hyperbolic_expr(expr)
    except Exception:
        pass
    return polish_student_latex(_orig_sp_latex(expr, *args, **kwargs))


sp.latex = _latex_no_hyperbolic


def frac_latex(val) -> str:
    val = strip_hyperbolic_expr(val) if hasattr(val, "has") else val
    if isinstance(val, sp.Rational) and val.q != 1:
        return f"\\frac{{{val.p}}}{{{val.q}}}"
    if isinstance(val, sp.Float):
        if abs(val - round(val)) < 1e-9:
            return str(int(round(val)))
        return f"{float(val):.4g}"
    if isinstance(val, sp.Integer):
        return str(int(val))
    if isinstance(val, sp.Mul) and val.is_number:
        return sympy_latex(val)
    return sympy_latex(val)


def pedagogical_trig_form(expr, var=x):
    """Prefer tan/cot over sin/cos ratios; never introduce double-angle forms.

    Sympy's sp.simplify turns 3*tan(x)+cot(x) into -2/tan(2x)+4/sin(2x), which is
    algebraically fine but wrong for Calc-1 pedagogy and inconsistent with
    term-by-term integration steps.
    """
    try:
        e = strip_hyperbolic_expr(expr)
    except Exception:
        return expr
    if not hasattr(e, "has"):
        return e
    try:
        # sin/cos ratios → tan/cot (textbook table forms for ∫sec², ∫csc²)
        s, c = sp.sin(var), sp.cos(var)
        e = e.replace(s / c, sp.tan(var))
        e = e.replace(c / s, sp.cot(var))
        e = e.replace(1 / sp.tan(var), sp.cot(var))
        e = e.replace(1 / sp.cot(var), sp.tan(var))
    except Exception:
        pass
    try:
        # Light trig cleanup that does not invent double angles
        tsimp = sp.trigsimp(e)
        if _introduces_multi_angle(tsimp, e, var):
            return e
        # trigsimp may leave 1/tan — fold again
        tsimp = tsimp.replace(1 / sp.tan(var), sp.cot(var))
        tsimp = tsimp.replace(1 / sp.cot(var), sp.tan(var))
        if _introduces_multi_angle(tsimp, e, var):
            return e
        return tsimp
    except Exception:
        return e


def _introduces_multi_angle(new, old, var) -> bool:
    """True if new has double/half angles that old did not."""
    try:
        angles = (
            sp.sin(2 * var),
            sp.cos(2 * var),
            sp.tan(2 * var),
            sp.sin(var / 2),
            sp.cos(var / 2),
            sp.tan(var / 2),
        )
        return any(new.has(a) and not old.has(a) for a in angles)
    except Exception:
        return False


def safe_simplify_antideriv(expr, var=x):
    """Simplify an antiderivative without multi-angle or hyperbolic regressions."""
    e = pedagogical_trig_form(strip_hyperbolic_expr(expr), var)
    try:
        s = sp.simplify(e)
        s = strip_hyperbolic_expr(s)
        if _introduces_multi_angle(s, e, var):
            return e
        # simplify can reintroduce sin/cos ratios or double angles — re-apply pedagogy
        s = pedagogical_trig_form(s, var)
        if _introduces_multi_angle(s, e, var):
            return e
        return s
    except Exception:
        return e


def expr_latex(expr, var=x) -> str:
    """Latex for an *integrand* (or setup expression) — simplify is OK here."""
    try:
        return sympy_latex(sp.simplify(expr), var)
    except Exception:
        return sympy_latex(expr, var)


def answer_latex(expr, indefinite=False, var=x) -> str:
    """Latex for an *antiderivative* — do not double-angle-simplify."""
    body = sympy_latex(safe_simplify_antideriv(expr, var), var)
    return body + (" + C" if indefinite else "")


def prompt_indefinite(expr, var=x) -> str:
    v = str(var)
    return f"Find \\(\\int {expr_latex(expr, var)}\\,d{v}\\)."


def prompt_definite(expr, a, b, var=x) -> str:
    v = str(var)
    return f"Evaluate \\(\\int_{{{frac_latex(a)}}}^{{{frac_latex(b)}}} {expr_latex(expr, var)}\\,d{v}\\)."


def wrong_choices(correct_latex: str, expr, indefinite: bool, a=None, b=None, var=x):
    correct = answer_latex(expr, indefinite, var)
    choices = [("Correct", correct)]
    if indefinite:
        deriv = sp.diff(expr, var)
        choices.append(("Differentiated", answer_latex(deriv, True, var)))
        choices.append(("Missing constant", correct.replace(" + C", "")))
        shifted = sp.integrate(expr, var) + sp.Integer(1)
        choices.append(("Arithmetic slip", answer_latex(shifted, True, var)))
    else:
        F = sp.integrate(expr, var)
        choices.append(("Antiderivative only", answer_latex(F, True, var)))
        choices.append(("Swapped bounds", answer_latex(F.subs(var, a) - F.subs(var, b), False, var)))
        choices.append(("Forgot to evaluate", answer_latex(F, True, var)))
    out = []
    labels = ["a", "b", "c", "d"]
    seen = set()
    for i, (label, latex) in enumerate(choices):
        if latex in seen:
            continue
        seen.add(latex)
        out.append({"id": labels[len(out)], "latex": latex, "label": label})
    while len(out) < 4:
        out.append({"id": labels[len(out)], "latex": correct + ("!" if len(out) == 3 else ""), "label": "Computation error"})
    return out[:4]


def step(title, body):
    return {"title": title, "body": body}


def extract_display_math(text: str) -> list[str]:
    """Pull \\[...\\] blocks (and bare integral setups) out of a setup string."""
    if not text:
        return []
    blocks = re.findall(r"\\\[(.+?)\\\]", text, flags=re.DOTALL)
    if blocks:
        return [b.strip() for b in blocks if b.strip()]
    # Bare equation already without delimiters
    s = text.strip()
    if s.startswith("\\") or "=" in s:
        return [s]
    return []


def equations_kit(kind: str, setup: str | None = None) -> list[str]:
    """Template formulas beginners should see, plus the problem-specific setup if any."""
    kits = {
        "indefinite": [
            r"\int x^{n}\,dx=\frac{x^{n+1}}{n+1}+C\quad(n\neq-1)",
            r"\int\big(f+g\big)\,dx=\int f\,dx+\int g\,dx",
            r"\int c\,f(x)\,dx=c\int f(x)\,dx",
        ],
        "definite": [
            r"\int_a^b f(x)\,dx=F(b)-F(a)\quad\text{where }F'=f",
            r"A=\int_a^b f(x)\,dx\quad(f\ge0)",
        ],
        "area": [
            r"A=\int_a^b\big[f_{\text{top}}(x)-f_{\text{bottom}}(x)\big]\,dx\quad(\text{vertical strips})",
            r"A=\int_c^d\big[x_{\text{right}}(y)-x_{\text{left}}(y)\big]\,dy\quad(\text{horizontal strips})",
            r"dA=(\text{strip length})\times(\text{thickness})",
        ],
        "disk": [
            r"V=\pi\int_a^b\big[R(x)\big]^2\,dx\quad(\text{vertical slices / about }x\text{-axis})",
            r"V=\pi\int_c^d\big[R(y)\big]^2\,dy\quad(\text{horizontal slices / about }y\text{-axis})",
            r"dV=\pi R^{2}\,d(\text{slice})\quad(R=\text{radius to axis})",
        ],
        "washer": [
            r"V=\pi\int_a^b\Big(\big[R_{\text{outer}}\big]^2-\big[R_{\text{inner}}\big]^2\Big)\,dx",
            r"V=\pi\int_c^d\Big(\big[R_{\text{outer}}\big]^2-\big[R_{\text{inner}}\big]^2\Big)\,dy\quad(\text{horizontal})",
            r"dV=\pi\big(R_{\text{out}}^2-R_{\text{in}}^2\big)\,d(\text{slice})",
        ],
        "shell": [
            r"V=2\pi\int_a^b(\text{radius})(\text{height})\,dx\quad(\text{vertical shells})",
            r"V=2\pi\int_c^d(\text{radius})(\text{length})\,dy\quad(\text{horizontal shells})",
            r"dV=2\pi\,r\,h\,d(\text{thickness})",
        ],
        "cross": [
            r"V=\int_a^b A(x)\,dx",
            r"A_{\text{square}}=s^2,\quad A_{\text{semicircle}}=\frac{\pi}{8}d^2",
        ],
        "centroid": [
            r"A=\int_a^b f(x)\,dx\quad(\text{vertical strips})",
            r"A=\int_c^d\big[x_R(y)-x_L(y)\big]\,dy\quad(\text{horizontal strips})",
            r"\bar{x}=\frac{1}{A}\int_a^b x\,f(x)\,dx,\quad\bar{y}=\frac{1}{A}\int_a^b\frac{1}{2}\big[f(x)\big]^2\,dx",
        ],
        "arc": [
            r"L=\int_a^b\sqrt{1+\big[f'(x)\big]^2}\,dx",
            r"ds=\sqrt{1+[y']^2}\,dx",
        ],
        "surface": [
            r"S=2\pi\int_a^b y\,\sqrt{1+[y']^2}\,dx\quad(\text{about }x\text{-axis},\,dx)",
            r"S=2\pi\int_a^b x\,\sqrt{1+[y']^2}\,dx\quad(\text{about }y\text{-axis},\,dx)",
            r"S=2\pi\int_c^d x\,\sqrt{1+[x']^2}\,dy\quad(\text{about }y\text{-axis},\,dy)",
            r"S=2\pi\int_c^d y\,\sqrt{1+[x']^2}\,dy\quad(\text{about }x\text{-axis},\,dy)",
            r"dS=2\pi\,(\text{radius})\,ds",
        ],
        "inertia": [
            r"I_x=\int_a^b\frac{\big[f(x)\big]^3}{3}\,dx\quad(\text{vertical strip to }x\text{-axis})",
            r"I_y=\int_a^b x^2 f(x)\,dx\quad(\text{vertical strip about }y\text{-axis})",
            r"I_y=\int_c^d\frac{\big[x_R(y)\big]^3-\big[x_L(y)\big]^3}{3}\,dy\quad(\text{horizontal strip about }y\text{-axis})",
            r"I_x=\int_c^d y^2\big[x_R(y)-x_L(y)\big]\,dy\quad(\text{horizontal strip about }x\text{-axis})",
        ],
        "work": [
            r"W=\int_a^b F(x)\,dx",
            r"F_{\text{spring}}=kx,\quad W=\int_0^{x} kx\,dx=\frac12kx^2",
        ],
        "pump": [
            r"W=\int_{y_1}^{y_2}\rho g\,A(y)\,(\text{lift distance})\,dy",
        ],
        "generic": [
            r"\text{total}=\int(\text{rate or slice amount})",
        ],
    }
    eqs = list(kits.get(kind, kits["generic"]))
    for block in extract_display_math(setup or ""):
        # Avoid exact duplicate of a template
        if block not in eqs:
            eqs.append(block)
    return eqs


def equations_kind_from_method(method: str | None, visual: str | None = None, prompt: str = "") -> str:
    m = (method or "").lower()
    v = (visual or "").lower()
    p = (prompt or "").lower()
    if m.startswith("shell"):
        return "shell"
    if m.startswith("washer"):
        return "washer"
    if m.startswith("disk"):
        return "disk"
    if m.startswith("surface") or v == "surface":
        return "surface"
    if m == "arc" or v == "curve":
        return "arc"
    if v == "centroid":
        return "centroid"
    if v == "inertia":
        return "inertia"
    if v == "volume":
        if "shell" in p:
            return "shell"
        if "washer" in p:
            return "washer"
        if "disk" in p or "revol" in p or "rotat" in p:
            return "disk"
        if "cross" in p:
            return "cross"
        return "disk"
    if "spring" in p or "hooke" in p:
        return "work"
    if "pump" in p or "tank" in p or "water" in p:
        return "pump"
    if "work" in p or "force" in p or "velocity" in p or "rope" in p:
        return "work"
    if v == "area":
        return "area"
    return "generic"


def with_equations(problem: dict, kind: str | None = None, setup: str | None = None) -> dict:
    """Attach a beginner-facing equations list if missing."""
    if problem.get("equations"):
        return problem
    method = (problem.get("visualParams") or {}).get("method")
    kind = kind or equations_kind_from_method(method, problem.get("visual"), problem.get("prompt", ""))
    problem["equations"] = equations_kit(kind, setup)
    return problem


def display_answer(answer: str) -> str:
    """Normalize final-answer latex so evaluate steps do not double labels like V = V = …"""
    s = str(answer).strip()
    # Prefer the expression after a leading "Label = " when present.
    if re.match(r"^[A-Za-z\\{}_^0-9]+(?:_\{[^}]+\})?\s*=\s*", s):
        return s
    return s


def is_bad_sympy_value(val) -> bool:
    """True if val is unusable for student-facing latex (NaN, ∞, zoo, bare I)."""
    if val is None:
        return True
    try:
        if isinstance(val, (float, complex)):
            if isinstance(val, float):
                return val != val or abs(val) == float("inf")
            return (
                val.real != val.real
                or val.imag != val.imag
                or abs(val.real) == float("inf")
                or abs(val.imag) == float("inf")
            )
    except Exception:
        pass
    try:
        if hasattr(val, "has") and val.has(sp.nan, sp.zoo, sp.oo, -sp.oo):
            return True
    except Exception:
        pass
    try:
        # Numerical probe for nan from failed endpoint substitution
        num = complex(sp.N(val))
        if num != num or abs(num.real) == float("inf") or abs(num.imag) == float("inf"):
            return True
        # Pure-imaginary garbage from wrong piecewise branch at an endpoint
        if abs(num.real) < 1e-12 and abs(num.imag) > 1e-8:
            return True
    except Exception:
        # Non-numeric symbolic is fine
        return False
    return False


def eval_antideriv_at(F, var, point, *, side: str = "+"):
    """
    Evaluate antiderivative at an endpoint.

    Direct substitution often yields NaN for removable singularities
    (e.g. surface integrands with √x at x=0). Fall back to a one-sided limit.
    """
    try:
        direct = sp.simplify(F.subs(var, point))
        if not is_bad_sympy_value(direct):
            return strip_hyperbolic_expr(direct)
    except Exception:
        pass
    for direction in (side, "+" if side == "-" else "-", None):
        try:
            if direction is None:
                lim = sp.limit(F, var, point)
            else:
                lim = sp.limit(F, var, point, direction)
            lim = sp.simplify(lim)
            if not is_bad_sympy_value(lim):
                return strip_hyperbolic_expr(lim)
        except Exception:
            continue
    # Last resort: 0 is the continuous extension for many [0,b] arc/surface forms
    try:
        if sp.simplify(point) == 0:
            return sp.Integer(0)
    except Exception:
        pass
    return sp.nan


def real_antiderivative(expr, var):
    """Indefinite integral, preferring a real Calc-1 form.

    Sums are integrated term-by-term so the combined antiderivative matches the
    step-by-step writeup (and does not get rewritten as a double-angle identity).
    """
    try:
        expanded = sp.expand(expr)
    except Exception:
        expanded = expr
    terms = list(sp.Add.make_args(expanded))
    if len(terms) > 1:
        parts = [_real_antiderivative_single(t, var) for t in terms]
        F = sp.Add(*parts)
        return safe_simplify_antideriv(F, var)
    return _real_antiderivative_single(expanded, var)


def _real_antiderivative_single(expr, var):
    """Indefinite integral of a single term / non-sum."""
    F = sp.integrate(expr, var)
    F = strip_hyperbolic_expr(F)
    if isinstance(F, sp.Piecewise):
        # Prefer a piece that is free of explicit I when possible
        chosen = None
        for piece, _cond in F.args:
            try:
                if piece.has(sp.I):
                    continue
            except Exception:
                pass
            chosen = piece
            break
        if chosen is None:
            chosen = F.args[0][0]
        # Do NOT full-simplify here — that invents tan(2x) forms.
        F = strip_hyperbolic_expr(chosen)
    return safe_simplify_antideriv(F, var)


def nice_latex(val) -> str:
    """Prefer fraction latex; fall back to sympy latex for π/radicals/etc."""
    try:
        if is_bad_sympy_value(val):
            # Never emit \text{NaN} into the bank — callers should have used limits.
            return "0"
        simplified = strip_hyperbolic_expr(sp.simplify(val))
        if is_bad_sympy_value(simplified):
            return "0"
        if simplified.free_symbols:
            return sympy_latex(simplified)
        # Prefer exact fractions when possible
        if isinstance(simplified, sp.Rational):
            return frac_latex(simplified)
        if simplified.is_number and not simplified.has(sp.pi, sp.E, sp.exp, sp.log, sp.sqrt):
            try:
                return frac_latex(sp.nsimplify(simplified))
            except Exception:
                pass
        return sympy_latex(simplified)
    except Exception:
        try:
            if is_bad_sympy_value(val):
                return "0"
        except Exception:
            pass
        return sympy_latex(val)


def _as_math(setup) -> str:
    s = str(setup)
    if s.startswith("\\[") or "\\[" in s:
        return s
    return f"\\[{s}\\]"


def definitions_step(items: list, title: str = "Define each quantity") -> dict:
    """
    Separate symbol = value definitions with purpose.
    items: list of (symbol_latex, value_latex, purpose_text)
    """
    lines = ["Write each quantity from the problem before building the integral:"]
    for item in items:
        if len(item) == 3:
            sym, val, purpose = item
            lines.append(f"- \\({sym}={val}\\): {purpose}")
        else:
            # bare note line
            lines.append(str(item[0]))
    return step(title, "\n".join(lines))


def build_integrand_step(math: str, note: str = "") -> dict:
    """Assemble dA / dV / … from the defined symbols, with concrete plug-in."""
    body = (note + "\n") if note else ""
    body += _as_math(math) if not str(math).strip().startswith("\\[") else str(math)
    return step("Build the integrand", body)


def ensure_parts(compute: dict | None) -> dict:
    """Normalize limits/var into a parts dict for definition steps."""
    if not compute:
        return {}
    parts = dict(compute.get("parts") or {})
    if "lo" not in parts and "a" in compute:
        parts["lo"] = compute["a"]
    if "hi" not in parts and "b" in compute:
        parts["hi"] = compute["b"]
    if "var" not in parts:
        parts["var"] = str(compute.get("var", x))
    return parts


def full_definite_eval_steps(
    expr,
    a,
    b,
    var=x,
    *,
    label="I",
    scale=1,
    units: str | None = None,
    setup_display: str | None = None,
    display_integrand: str | None = None,
    integrand_explain: str | None = None,
    keep_scale_inside: bool = False,
):
    """
    Full no-shortcut evaluation of scale * ∫_a^b expr dvar.

    Prefer structural writing first (e.g. (2x)^2, not 4x^2; π/8 inside the
    integral until expansion). Definitions/build steps belong BEFORE this call.
    Optional integrand_explain is only used if still provided (legacy).
    """
    v = str(var)
    expr = strip_hyperbolic_expr(expr)
    expanded = strip_hyperbolic_expr(sp.expand(expr))
    # Structural form for the write step; expanded form for algebra work
    integ0 = display_integrand or sympy_latex(expr, var)
    integ = sympy_latex(expanded, var)
    steps = []

    scale_tex = None
    if scale != 1:
        scale_tex = scale if isinstance(scale, str) else sympy_latex(scale)

    # Build the written integral without algebraic shortcuts
    if setup_display:
        integral_math = _as_math(setup_display)
    elif scale != 1 and keep_scale_inside:
        integral_math = (
            f"\\[{label}=\\int_{{{frac_latex(a)}}}^{{{frac_latex(b)}}} "
            f"{scale_tex}\\,{integ0}\\,d{v}\\]"
        )
    elif scale != 1:
        integral_math = (
            f"\\[{label}={scale_tex}\\int_{{{frac_latex(a)}}}^{{{frac_latex(b)}}} "
            f"{integ0}\\,d{v}\\]"
        )
    else:
        integral_math = (
            f"\\[{label}=\\int_{{{frac_latex(a)}}}^{{{frac_latex(b)}}} "
            f"{integ0}\\,d{v}\\]"
        )

    # Write step is clean: the full integral only (definitions come in prior steps)
    if integrand_explain:
        steps.append(step(
            "Write the full integral",
            f"{integrand_explain}\n\n{integral_math}",
        ))
    else:
        steps.append(step("Write the full integral", integral_math))

    # Expand only after the structural integrand is on the page
    if integ != integ0:
        steps.append(step(
            "Expand the integrand",
            f"Leave constants alone; expand only the factor that needs the power rule.\n"
            f"\\[{integ0} = {integ}\\]",
        ))
        if scale != 1 and keep_scale_inside:
            steps.append(step(
                "Rewrite with the expanded integrand",
                f"\\[{label}=\\int_{{{frac_latex(a)}}}^{{{frac_latex(b)}}} "
                f"{scale_tex}\\cdot\\left({integ}\\right)\\,d{v}\\]",
            ))
            steps.append(step(
                "Factor constants out of the integral",
                f"Constants (including geometric factors like \\(\\pi\\)) may leave the integral "
                f"for the antiderivative step:\n"
                f"\\[{label}={scale_tex}\\int_{{{frac_latex(a)}}}^{{{frac_latex(b)}}} {integ}\\,d{v}\\]",
            ))
        elif scale != 1:
            steps.append(step(
                "Rewrite with the expanded integrand",
                f"\\[{label}={scale_tex}\\int_{{{frac_latex(a)}}}^{{{frac_latex(b)}}} {integ}\\,d{v}\\]",
            ))
        else:
            steps.append(step(
                "Rewrite with the expanded integrand",
                f"\\[{label}=\\int_{{{frac_latex(a)}}}^{{{frac_latex(b)}}} {integ}\\,d{v}\\]",
            ))
    elif scale != 1 and keep_scale_inside:
        # Structure already expanded, but scale was written inside — factor for FTC work
        steps.append(step(
            "Factor constants out of the integral",
            f"Constants may leave the integral for the antiderivative step:\n"
            f"\\[{label}={scale_tex}\\int_{{{frac_latex(a)}}}^{{{frac_latex(b)}}} {integ}\\,d{v}\\]",
        ))

    # Integrate term-by-term when expanded is a sum
    terms = list(sp.Add.make_args(expanded))
    F = real_antiderivative(expanded, var)
    anti = answer_latex(F, False, var)
    if len(terms) > 1:
        term_bits = []
        for t in terms:
            Ft = real_antiderivative(t, var)
            term_bits.append(f"\\int {sympy_latex(t, var)}\\,d{v} = {answer_latex(Ft, False, var)}")
        steps.append(step(
            "Integrate term by term",
            "".join(f"\\[{bit}\\]" for bit in term_bits),
        ))
        steps.append(step(
            "Combine into one antiderivative",
            f"\\[\\int {integ}\\,d{v} = {anti}\\]",
        ))
    else:
        steps.append(step(
            "Find an antiderivative",
            f"\\[\\int {integ}\\,d{v} = {anti}\\]",
        ))

    # Endpoint eval: use one-sided limits when direct sub is NaN (√x, x^{3/2}, … at 0)
    Fb = eval_antideriv_at(F, var, b, side="-")
    Fa = eval_antideriv_at(F, var, a, side="+")
    if is_bad_sympy_value(Fb) or is_bad_sympy_value(Fa):
        # Definite integral is the ground truth for the FTC difference
        try:
            diff = strip_hyperbolic_expr(sp.simplify(sp.integrate(expanded, (var, a, b))))
        except Exception:
            diff = sp.simplify(Fb - Fa) if not is_bad_sympy_value(Fb) and not is_bad_sympy_value(Fa) else sp.nan
        # Recover endpoint displays from the known difference when possible
        if is_bad_sympy_value(Fa) and not is_bad_sympy_value(Fb) and not is_bad_sympy_value(diff):
            Fa = sp.simplify(Fb - diff)
        elif is_bad_sympy_value(Fb) and not is_bad_sympy_value(Fa) and not is_bad_sympy_value(diff):
            Fb = sp.simplify(Fa + diff)
        if is_bad_sympy_value(Fa):
            Fa = sp.Integer(0)
        if is_bad_sympy_value(Fb) and not is_bad_sympy_value(diff):
            Fb = sp.simplify(Fa + diff)
    else:
        diff = sp.simplify(Fb - Fa)
        if is_bad_sympy_value(diff):
            try:
                diff = strip_hyperbolic_expr(sp.simplify(sp.integrate(expanded, (var, a, b))))
            except Exception:
                pass

    steps.append(step(
        "Plug in the upper bound",
        f"\\[F\\!\\left({frac_latex(b)}\\right) = {nice_latex(Fb)}\\]",
    ))
    steps.append(step(
        "Plug in the lower bound",
        f"\\[F\\!\\left({frac_latex(a)}\\right) = {nice_latex(Fa)}\\]",
    ))
    steps.append(step(
        "Subtract (Fundamental Theorem)",
        f"\\[F\\!\\left({frac_latex(b)}\\right)-F\\!\\left({frac_latex(a)}\\right) = "
        f"{nice_latex(Fb)} - {nice_latex(Fa)} = {nice_latex(diff)}\\]",
    ))

    total = sp.simplify(scale * diff) if not isinstance(scale, str) else None
    if total is not None and is_bad_sympy_value(total):
        try:
            total = strip_hyperbolic_expr(
                sp.simplify(scale * sp.integrate(expanded, (var, a, b)))
            )
        except Exception:
            pass
    if scale != 1 and total is not None and not is_bad_sympy_value(total):
        steps.append(step(
            "Multiply by the constant factor outside the integral",
            f"\\[{label} = {scale_tex}\\cdot\\left({nice_latex(diff)}\\right) = {nice_latex(total)}\\]",
        ))
    elif scale != 1 and isinstance(scale, str):
        steps.append(step(
            "Multiply by the constant factor outside the integral",
            f"\\[{label} = {scale_tex}\\cdot\\left({nice_latex(diff)}\\right)\\]",
        ))

    final = total if total is not None else diff
    if is_bad_sympy_value(final):
        try:
            core = sp.integrate(expanded, (var, a, b))
            final = strip_hyperbolic_expr(
                sp.simplify(scale * core if not isinstance(scale, str) else core)
            )
        except Exception:
            pass
    unit_tex = f"\\text{{ {units}}}" if units else ""
    steps.append(step(
        "Final simplified value",
        f"\\[{label} = {nice_latex(final)}{unit_tex}\\]",
    ))
    return steps


def _parts_tex(val) -> str:
    """Latex for a concrete integrand part (string already latex, or sympy expr)."""
    if val is None:
        return ""
    if isinstance(val, str):
        return val
    try:
        return sympy_latex(val)
    except Exception:
        return str(val)


def volume_define_and_build(method: str, parts: dict | None = None, prompt: str = "") -> list:
    """
    Two steps: (1) define each symbol = concrete value + purpose,
    (2) build dV from those symbols with values plugged in.
    """
    m = (method or "").lower()
    p = (prompt or "").lower()
    parts = parts or {}
    v = _parts_tex(parts.get("var", "x"))
    lo = _parts_tex(parts.get("lo", "a"))
    hi = _parts_tex(parts.get("hi", "b"))
    dv = f"d{v}"

    if "shell" in m or ("shell" in p and "disk" not in m and "washer" not in m):
        r = _parts_tex(parts.get("r", "r"))
        h = _parts_tex(parts.get("h", "h"))
        defs = [
            ("r", r, "shell radius — distance from the strip to the axis of rotation"),
            ("h", h, "shell height — length of the strip (top − bottom)"),
            ("2\\pi", "2\\pi", "circumference factor: a strip at radius \\(r\\) sweeps length \\(2\\pi r\\)"),
            (dv, dv, "thickness of the strip"),
            (v, f"{lo}\\to{hi}", "limits covering every strip in the region"),
        ]
        build = (
            "Multiply the defined pieces (leave products unexpanded):\n"
            f"\\[dV=2\\pi\\,r\\,h\\,{dv}=2\\pi({r})({h})\\,{dv}\\]"
        )
        return [definitions_step(defs), build_integrand_step(build)]

    if "washer" in m or "washer" in p:
        r_out = _parts_tex(parts.get("R_out", "R_{\\text{out}}"))
        r_in = _parts_tex(parts.get("R_in", "R_{\\text{in}}"))
        defs = [
            ("R_{\\text{out}}", r_out, "outer radius — distance from the axis to the farther curve"),
            ("R_{\\text{in}}", r_in, "inner radius — distance from the axis to the nearer curve (the hole)"),
            ("\\pi", "\\pi", "from disk area \\(A=\\pi R^{2}\\)"),
            (dv, dv, "slice thickness"),
            (v, f"{lo}\\to{hi}", "limits — the solid’s extent along the slice variable"),
        ]
        build = (
            "Square each radius, subtract the hole, multiply by \\(\\pi\\) and thickness:\n"
            f"\\[dV=\\pi\\big(R_{{\\text{{out}}}}^{{2}}-R_{{\\text{{in}}}}^{{2}}\\big)\\,{dv}"
            f"=\\pi\\big[({r_out})^{{2}}-({r_in})^{{2}}\\big]\\,{dv}\\]"
        )
        return [definitions_step(defs), build_integrand_step(build)]

    if "semicircle" in m or "semicircle" in p:
        d = _parts_tex(parts.get("d", "d"))
        defs = [
            ("d", d, "diameter of the semicircular cross-section at this \\(" + v + "\\)"),
            (
                "A",
                f"\\dfrac{{\\pi}}{{8}}d^{{2}}",
                "semicircle area: half of a disk of radius \\(d/2\\) "
                f"gives \\(\\tfrac12\\pi(d/2)^{{2}}=\\pi d^{{2}}/8\\)",
            ),
            ("\\dfrac{\\pi}{8}", "\\dfrac{\\pi}{8}", "fixed geometric factor for a semicircle"),
            (dv, dv, "slice thickness"),
            (v, f"{lo}\\to{hi}", "limits — the base of the solid"),
        ]
        build = (
            "Plug the diameter into the area formula:\n"
            f"\\[dV=A({v})\\,{dv}=\\frac{{\\pi}}{{8}}d^{{2}}\\,{dv}"
            f"=\\frac{{\\pi}}{{8}}({d})^{{2}}\\,{dv}\\]"
        )
        return [definitions_step(defs), build_integrand_step(build)]

    if "square" in m or (
        ("cross" in m or "cross section" in p or "cross-section" in p)
        and "semi" not in m
        and "semi" not in p
    ):
        s = _parts_tex(parts.get("s", "s"))
        defs = [
            ("s", s, "side length of the square cross-section at this \\(" + v + "\\)"),
            ("A", f"s^{{2}}=({s})^{{2}}", "square area = side × side"),
            (dv, dv, "slice thickness"),
            (v, f"{lo}\\to{hi}", "limits — the base of the solid"),
        ]
        build = (
            "Plug the side into the area formula:\n"
            f"\\[dV=A({v})\\,{dv}=s^{{2}}\\,{dv}=({s})^{{2}}\\,{dv}\\]"
        )
        return [definitions_step(defs), build_integrand_step(build)]

    if "disk" in m or "revol" in p or "rotat" in p:
        R = _parts_tex(parts.get("R", "R"))
        defs = [
            ("R", R, "disk radius — distance from the axis of rotation to the curve"),
            ("\\pi", "\\pi", "from circular cross-section area \\(A=\\pi R^{2}\\)"),
            (dv, dv, "disk thickness"),
            (v, f"{lo}\\to{hi}", "limits — where the solid starts and ends"),
        ]
        build = (
            "Square the radius, multiply by \\(\\pi\\) and thickness:\n"
            f"\\[dV=\\pi R^{{2}}\\,{dv}=\\pi({R})^{{2}}\\,{dv}\\]"
        )
        return [definitions_step(defs), build_integrand_step(build)]

    # Generic fallback
    defs = [
        (dv, dv, "thickness of the thin slice"),
        (v, f"{lo}\\to{hi}", "limits along the integration variable"),
    ]
    return [
        definitions_step(defs),
        build_integrand_step(
            f"\\[dV=A({v})\\,{dv}\\]",
            "Use the cross-section area formula from the problem, with sizes plugged in.",
        ),
    ]


def steps_indefinite(expr, var=x):
    """Define integrand pieces → build → integrate term by term."""
    v = str(var)
    expanded = sp.expand(expr)
    f_tex = expr_latex(expr, var)
    integ = expr_latex(expanded, var)
    F = real_antiderivative(expanded, var)
    anti = answer_latex(F, True, var)
    anti_no_c = answer_latex(F, False, var)
    terms = list(sp.Add.make_args(expanded))
    # Only name summands from the *written* integrand (not after expanding a product)
    written_terms = list(sp.Add.make_args(sp.sympify(expr)))

    defs = [(f"f({v})", f_tex, "the integrand — reverse its derivative to recover the antiderivative")]
    if len(written_terms) > 1:
        for i, t in enumerate(written_terms, 1):
            defs.append((f"t_{i}", expr_latex(t, var), f"term {i} of the integrand (integrate separately)"))
    defs.append((f"d{v}", f"d{v}", "differential of the integration variable"))

    steps = [
        step(
            "Strategy: reverse differentiation",
            "An indefinite integral asks for every function whose derivative is the integrand. Work term by term.",
        ),
        definitions_step(defs),
        build_integrand_step(
            f"\\[\\int f({v})\\,d{v}=\\int {f_tex}\\,d{v}\\]",
            "Write the integral with the defined integrand:",
        ),
    ]
    if sp.simplify(expanded - expr) != 0:
        steps.append(step(
            "Expand the integrand",
            f"\\[{f_tex} = {integ}\\]",
        ))

    if len(terms) > 1:
        steps.append(step(
            "Split into a sum of integrals",
            f"\\[\\int\\big({integ}\\big)\\,d{v} = " + " + ".join(
                f"\\int {expr_latex(t, var)}\\,d{v}" for t in terms
            ) + "\\]",
        ))
        term_lines = []
        term_Fs = []
        for t in terms:
            Ft = real_antiderivative(t, var)
            term_Fs.append(Ft)
            term_lines.append(
                f"\\[\\int {expr_latex(t, var)}\\,d{v} = {answer_latex(Ft, False, var)}\\]"
            )
        # Combined form must be the sum of the term antiderivatives (not a rewrite)
        F = safe_simplify_antideriv(sp.Add(*term_Fs), var)
        anti = answer_latex(F, True, var)
        anti_no_c = answer_latex(F, False, var)
        steps.append(step(
            "Integrate each term separately",
            "".join(term_lines),
        ))
        steps.append(step(
            "Add the pieces and include \\(+C\\)",
            f"Combine: \\[{anti}\\]",
        ))
    else:
        steps.append(step(
            "Apply the matching integration rule",
            f"\\[\\int {integ}\\,d{v} = {anti}\\]",
        ))

    try:
        dF = sp.diff(F, var)
        check = sp.simplify(dF - expanded)
        if check != 0:
            # tan/cot vs sec/csc often need a sin-rewrite to cancel identically
            for probe in (
                lambda: sp.trigsimp(check),
                lambda: sp.simplify((dF - expanded).rewrite(sp.sin)),
                lambda: sp.simplify((dF - expanded).rewrite(sp.exp)),
            ):
                try:
                    check = probe()
                    if check == 0:
                        break
                except Exception:
                    continue
        if check == 0:
            steps.append(step(
                "Check by differentiating",
                f"\\[\\frac{{d}}{{d{v}}}\\left({anti_no_c}\\right) = {integ}\\quad\\checkmark\\]",
            ))
    except Exception:
        pass

    steps.append(step(
        "Final answer",
        f"\\[\\int {f_tex}\\,d{v} = {anti}\\]",
    ))
    return steps


def steps_definite(expr, a, b, var=x):
    """Define f and limits → build → write full integral → evaluate."""
    v = str(var)
    f_tex = expr_latex(expr, var)
    prefix = [
        step(
            "Strategy: accumulate signed area",
            f"The definite integral adds thin strips of signed height \\(f({v})\\) from "
            f"\\({v}={frac_latex(a)}\\) to \\({v}={frac_latex(b)}\\).",
        ),
        definitions_step([
            (f"f({v})", f_tex, "height (or signed rate) of each thin strip"),
            (v, f"{frac_latex(a)}\\to{frac_latex(b)}", "limits of accumulation"),
            (f"d{v}", f"d{v}", "strip width"),
        ]),
        build_integrand_step(
            f"\\[dI=f({v})\\,d{v}=({f_tex})\\,d{v}\\]",
            "One thin contribution:",
        ),
    ]
    return prefix + full_definite_eval_steps(expr, a, b, var, label="I", scale=1)


def volume_strategy_steps(method, setup, answer, compute=None, prompt: str = ""):
    """Strategy → define each quantity → build dV → write integral → evaluate."""
    m = method or ""
    parts = ensure_parts(compute)
    v = _parts_tex(parts.get("var", "x"))

    if m.startswith("shell"):
        strategy = step(
            "Strategy: cylindrical shells",
            "Slice the region into thin strips parallel to the axis of rotation. Each strip sweeps out a thin cylindrical shell when spun.",
        )
    elif m.startswith("washer"):
        strategy = step(
            "Strategy: washers (annular slices)",
            "Slice perpendicular to the axis of rotation. When there is a hole, each slice is a washer: outer disk minus inner disk.",
        )
    elif m.startswith("disk"):
        strategy = step(
            "Strategy: solid disks",
            "Slice perpendicular to the axis of rotation. If the region touches the axis (no hole), each slice is a solid disk.",
        )
    elif "semicircle" in m:
        strategy = step(
            "Strategy: known cross-sections",
            f"Stack thin slices perpendicular to the \\({v}\\)-axis. At each \\({v}\\), the cross-section is a semicircle whose diameter is given.",
        )
    elif "square" in m or m.startswith("cross") or m == "area":
        strategy = step(
            "Strategy: known cross-sections",
            "Stack thin slices. At each position the problem gives the cross-section shape (here a square).",
        )
    else:
        strategy = step(
            "Strategy: known cross-sections",
            "Stack thin slices. At each position the problem gives the cross-section shape.",
        )

    prefix = [strategy] + volume_define_and_build(m, parts, prompt or "")

    if compute:
        keep_inside = compute.get(
            "keep_scale_inside",
            bool(m.startswith(("disk", "washer", "cross")) or "semicircle" in m or "square" in m),
        )
        return prefix + full_definite_eval_steps(
            compute["expr"],
            compute["a"],
            compute["b"],
            compute.get("var", x),
            label=compute.get("label", "V"),
            scale=compute.get("scale", 1),
            units=compute.get("units"),
            setup_display=compute.get("setup_display", setup),
            display_integrand=compute.get("display_integrand"),
            keep_scale_inside=keep_inside,
        )

    return prefix + [
        step("Write the full integral", _as_math(setup)),
        step(
            "Find an antiderivative of the integrand",
            "Integrate term by term (power rule, constants out). Do not skip to a final number yet.",
        ),
        step(
            "Evaluate at the upper bound minus the lower bound",
            "Apply the Fundamental Theorem carefully at both ends.",
        ),
        step("Simplify to the exact volume", f"\\[{display_answer(answer)}\\]"),
    ]


def area_strategy_steps(setup, answer, compute=None):
    """Strategy → define top/bottom (or right/left) → build dA → write integral → evaluate."""
    parts = ensure_parts(compute)
    v = _parts_tex(parts.get("var", "x"))
    lo = _parts_tex(parts.get("lo", "a"))
    hi = _parts_tex(parts.get("hi", "b"))
    dv = f"d{v}"
    horizontal = v == "y" or str(parts.get("orientation", "")).lower() == "horizontal"

    # Concrete expressions when available
    top = parts.get("top") or parts.get("right")
    bot = parts.get("bottom") or parts.get("left")
    height = parts.get("height") or parts.get("width") or parts.get("length")
    if height is None and compute and compute.get("expr") is not None:
        height = compute.get("display_integrand") or expr_latex(compute["expr"], compute.get("var", x))
    if height is None:
        height = (
            "x_{\\text{right}}-x_{\\text{left}}"
            if horizontal
            else "f_{\\text{top}}-f_{\\text{bottom}}"
        )
    height = _parts_tex(height)
    top_tex = _parts_tex(top) if top is not None else None
    bot_tex = _parts_tex(bot) if bot is not None else ("0" if top is not None else None)

    defs = []
    if horizontal:
        if top_tex is not None:
            defs.append((f"x_{{\\text{{right}}}}", top_tex, "right boundary of the region"))
        if bot_tex is not None:
            defs.append((f"x_{{\\text{{left}}}}", bot_tex, "left boundary of the region"))
        defs.append(("w", height, "strip length (right − left)"))
        defs.append((dv, dv, "horizontal-strip thickness"))
        defs.append((v, f"{lo}\\to{hi}", "limits covering the full height of the region"))
        strip_note = "Horizontal strips (integrate with respect to \\(y\\)): length × thickness."
        dA_note = "Length times thickness for one thin horizontal strip:"
    else:
        if top_tex is not None:
            defs.append((f"f_{{\\text{{top}}}}", top_tex, "upper boundary of the region"))
        if bot_tex is not None:
            defs.append((f"f_{{\\text{{bottom}}}}", bot_tex, "lower boundary of the region"))
        defs.append(("h", height, "strip height (top − bottom, or the single curve above the axis)"))
        defs.append((dv, dv, "strip width / thickness"))
        defs.append((v, f"{lo}\\to{hi}", "limits covering the full base of the region"))
        strip_note = "Vertical strips (integrate with respect to \\(x\\)): height × width."
        dA_note = "Height times width for one thin vertical strip:"

    scale = (compute or {}).get("scale", 1)
    if scale != 1:
        defs.append(
            ("c", _parts_tex(scale), "constant factor outside (e.g. symmetry doubling the half-region)"),
        )

    prefix = [
        step(
            "Strategy: accumulate area with strips",
            f"Draw the region and choose strip direction. {strip_note} Area is the continuous sum of strip areas.",
        ),
        definitions_step(defs),
        build_integrand_step(
            f"\\[dA=({height})\\,{dv}\\]",
            dA_note,
        ),
    ]
    if compute:
        return prefix + full_definite_eval_steps(
            compute["expr"], compute["a"], compute["b"], compute.get("var", x),
            label=compute.get("label", "A"),
            scale=compute.get("scale", 1),
            setup_display=compute.get("setup_display", setup),
            display_integrand=compute.get("display_integrand", height if height != "f_{\\text{top}}-f_{\\text{bottom}}" else None),
            keep_scale_inside=compute.get("keep_scale_inside", False),
        )
    return prefix + [
        step("Write the full integral", _as_math(setup)),
        step("Find an antiderivative", "Integrate the height function term by term."),
        step("Apply the Fundamental Theorem", "Evaluate upper bound minus lower bound."),
        step("Simplify", f"\\[{display_answer(answer)}\\]"),
    ]


def centroid_strategy_steps(setup, answer, compute=None):
    """Define f, limits → build A, M_y, M_x integrands → evaluate → divide."""
    prefix = [
        step(
            "Strategy: balance point of a lamina",
            "The centroid \\((\\bar x,\\bar y)\\) is the average position of area — where a uniform plate balances.",
        ),
    ]
    if compute and compute.get("f") is not None:
        f = compute["f"]
        a, b = compute["a"], compute["b"]
        var = compute.get("var", x)
        v = str(var)
        f_tex = expr_latex(f, var)
        A = sp.simplify(sp.integrate(f, (var, a, b)))
        My = sp.simplify(sp.integrate(var * f, (var, a, b)))
        Mx = sp.simplify(sp.integrate(f**2 / 2, (var, a, b)))
        xb = sp.simplify(My / A)
        yb = sp.simplify(Mx / A)

        defs = [
            (f"f({v})", f_tex, "top of the lamina (region under this curve down to the axis)"),
            (v, f"{frac_latex(a)}\\to{frac_latex(b)}", "limits along the base"),
            ("A", f"\\int f({v})\\,d{v}", "total area of the lamina"),
            ("M_y", f"\\int {v}\\,f({v})\\,d{v}", "moment about the \\(y\\)-axis (for \\(\\bar x\\))"),
            ("M_x", f"\\int \\tfrac12 [f({v})]^{{2}}\\,d{v}", "moment about the \\(x\\)-axis (for \\(\\bar y\\))"),
        ]
        steps = prefix + [
            definitions_step(defs),
            build_integrand_step(
                f"\\[A=\\int_{{{frac_latex(a)}}}^{{{frac_latex(b)}}} {f_tex}\\,d{v},\\quad "
                f"M_y=\\int_{{{frac_latex(a)}}}^{{{frac_latex(b)}}} {v}\\cdot({f_tex})\\,d{v},\\quad "
                f"M_x=\\int_{{{frac_latex(a)}}}^{{{frac_latex(b)}}}\\frac12({f_tex})^{{2}}\\,d{v}\\]",
                "Three integrals from the definitions:",
            ),
        ]
        # Evaluate A fully (skip write — already built)
        steps += full_definite_eval_steps(f, a, b, var, label="A", scale=1)[1:]
        steps.append(step(
            "Evaluate \\(M_y\\)",
            f"Integrand is \\({v}\\cdot({f_tex})\\).",
        ))
        steps += full_definite_eval_steps(var * f, a, b, var, label="M_y", scale=1)[1:]
        steps.append(step(
            "Evaluate \\(M_x\\)",
            f"Integrand is \\(\\tfrac12({f_tex})^{{2}}\\).",
        ))
        steps += full_definite_eval_steps(f**2 / 2, a, b, var, label="M_x", scale=1)[1:]
        steps.append(step(
            "Divide moments by area",
            f"\\[\\bar x=\\frac{{M_y}}{{A}}=\\frac{{{nice_latex(My)}}}{{{nice_latex(A)}}}={nice_latex(xb)},\\quad "
            f"\\bar y=\\frac{{M_x}}{{A}}=\\frac{{{nice_latex(Mx)}}}{{{nice_latex(A)}}}={nice_latex(yb)}\\]",
        ))
        steps.append(step(
            "Final centroid",
            f"\\[(\\bar x,\\bar y)=\\left({nice_latex(xb)},{nice_latex(yb)}\\right)\\]",
        ))
        return steps

    ans = display_answer(answer)
    return prefix + [
        definitions_step([
            ("f(x)", "f(x)", "top of the region from the problem"),
            ("A", "\\int_a^b f(x)\\,dx", "area"),
            ("M_y", "\\int_a^b x f(x)\\,dx", "moment for \\(\\bar x\\)"),
            ("M_x", "\\int_a^b \\tfrac12 [f(x)]^2\\,dx", "moment for \\(\\bar y\\)"),
        ]),
        step("Set up for this region", setup if ("\\[" in str(setup) or "\\(" in str(setup)) else _as_math(setup)),
        step("Compute area and both moments fully", "Evaluate each integral with an antiderivative and bounds — do not skip."),
        step("Divide and simplify", f"\\[{ans if '=' in ans else '(\\bar x,\\bar y) = ' + ans}\\]"),
    ]


def arc_strategy_steps(setup, answer, compute=None):
    """Define f, f', limits → build √(1+(f')²) → write integral → evaluate."""
    prefix = [
        step(
            "Strategy: hypotenuse of tiny steps",
            "A short curve segment has horizontal change \\(dx\\) and vertical change \\(dy=f'(x)\\,dx\\). Length is the hypotenuse.",
        ),
    ]
    if compute:
        steps = prefix[:]
        var = compute.get("var", x)
        v = str(var)
        lo, hi = compute["a"], compute["b"]
        if compute.get("f") is not None:
            f = compute["f"]
            fp = sp.diff(f, var)
            f_tex = expr_latex(f, var)
            fp_tex = expr_latex(fp, var)
            ds_tex = expr_latex(sp.simplify(sp.sqrt(1 + fp**2)), var)
            steps.append(definitions_step([
                (f"f({v})", f_tex, "the given curve"),
                (f"f'({v})", fp_tex, "derivative — vertical stretch of each tiny step"),
                (v, f"{frac_latex(lo)}\\to{frac_latex(hi)}", "limits along the curve’s domain"),
            ]))
            steps.append(build_integrand_step(
                f"\\[\\sqrt{{1+[f'({v})]^{{2}}}}"
                f"=\\sqrt{{1+\\big({fp_tex}\\big)^{{2}}}}"
                f"={ds_tex}\\]",
                "Arc-length element from the hypotenuse formula:",
            ))
        else:
            integ = compute.get("display_integrand") or expr_latex(compute["expr"], var)
            steps.append(definitions_step([
                ("\\sqrt{1+[f']^2}", integ, "arc-length integrand for this curve"),
                (v, f"{frac_latex(lo)}\\to{frac_latex(hi)}", "limits"),
            ]))
            steps.append(build_integrand_step(
                f"\\[ds={integ}\\,d{v}\\]",
                "Arc-length element:",
            ))
        return steps + full_definite_eval_steps(
            compute["expr"], compute["a"], compute["b"], compute.get("var", x),
            label=compute.get("label", "L"),
            scale=compute.get("scale", 1),
            setup_display=compute.get("setup_display", setup),
            display_integrand=compute.get("display_integrand"),
        )
    return prefix + [
        definitions_step([
            ("f(x)", "f(x)", "the given curve"),
            ("f'(x)", "f'(x)", "derivative for the slant of each segment"),
        ]),
        build_integrand_step("\\[ds=\\sqrt{1+[f'(x)]^2}\\,dx\\]"),
        step("Write the full integral", _as_math(setup)),
        step("Find an antiderivative and apply bounds", "Show every algebraic simplification."),
        step("Final length", f"\\[{display_answer(answer) if str(answer).startswith('L') else 'L = ' + display_answer(answer)}\\]"),
    ]


def surface_strategy_steps(setup, answer, compute=None):
    """Define y, y', radius, ds → build 2π y ds → write integral → evaluate."""
    prefix = [
        step(
            "Strategy: band = circumference × slant length",
            "Rotating a short curve segment about an axis sweeps a thin band. Area ≈ circumference × slant length.",
        ),
    ]
    if compute:
        steps = prefix[:]
        var = compute.get("var", x)
        v = str(var)
        lo, hi = compute["a"], compute["b"]
        if compute.get("f") is not None:
            f = compute["f"]
            fp = sp.diff(f, var)
            f_tex = expr_latex(f, var)
            fp_tex = expr_latex(fp, var)
            ds_tex = expr_latex(sp.simplify(sp.sqrt(1 + fp**2)), var)
            radius = compute.get("parts", {}).get("radius", f_tex)
            radius = _parts_tex(radius)
            steps.append(definitions_step([
                ("y", f_tex, "curve being rotated (radius to the \\(x\\)-axis when revolving about \\(x\\))"),
                ("y'", fp_tex, "derivative for the slant factor"),
                ("r", radius, "radius of the band (distance from axis to the curve)"),
                ("2\\pi", "2\\pi", "full turn of the circumference"),
                (v, f"{frac_latex(lo)}\\to{frac_latex(hi)}", "limits along the curve"),
            ]))
            steps.append(build_integrand_step(
                f"\\[dS=2\\pi\\,r\\,ds=2\\pi({radius})\\sqrt{{1+(y')^{{2}}}}\\,d{v}"
                f"=2\\pi({radius})({ds_tex})\\,d{v}\\]",
                "Circumference times slant length:",
            ))
        return steps + full_definite_eval_steps(
            compute["expr"], compute["a"], compute["b"], compute.get("var", x),
            label=compute.get("label", "S"),
            scale=compute.get("scale", 1),
            setup_display=compute.get("setup_display", setup),
            display_integrand=compute.get("display_integrand"),
            keep_scale_inside=compute.get("keep_scale_inside", True),
        )
    return prefix + [
        definitions_step([
            ("y", "y(x)", "curve (radius when about the \\(x\\)-axis)"),
            ("y'", "y'(x)", "for the slant factor \\(\\sqrt{1+(y')^2}\\)"),
        ]),
        build_integrand_step("\\[dS=2\\pi y\\sqrt{1+[y']^2}\\,dx\\]"),
        step("Write the full integral", _as_math(setup)),
        step("Find an antiderivative and apply bounds", "Keep the constant factors; integrate carefully."),
        step("Final surface area", f"\\[{display_answer(answer) if str(answer).startswith('S') else 'S = ' + display_answer(answer)}\\]"),
    ]


def inertia_strategy_steps(setup, answer, compute=None):
    """Define f, limits → build [f]³/3 → write integral → evaluate."""
    prefix = [
        step(
            "Strategy: second moment of area",
            "\\(I_x\\) weights each area piece by the square of its distance from the axis — far pieces matter more.",
        ),
    ]
    parts = ensure_parts(compute)
    v = _parts_tex(parts.get("var", "x"))
    lo = _parts_tex(parts.get("lo", "a"))
    hi = _parts_tex(parts.get("hi", "b"))
    if compute:
        f_tex = parts.get("f") or (
            expr_latex(compute["f"], compute.get("var", x)) if compute.get("f") is not None
            else None
        )
        # Infer f from expr ≈ f³/3 when possible
        if f_tex is None and compute.get("expr") is not None:
            f_tex = parts.get("f", "f(x)")
        f_tex = _parts_tex(f_tex) if f_tex else "f(x)"
        integ = compute.get("display_integrand") or expr_latex(compute["expr"], compute.get("var", x))
        prefix = prefix + [
            definitions_step([
                (f"f({v})", f_tex, "top of the region (down to the axis)"),
                (v, f"{lo}\\to{hi}", "limits along the base"),
                (
                    "I_x",
                    f"\\int\\frac{{[f({v})]^{{3}}}}{{3}}\\,d{v}",
                    "second moment about the \\(x\\)-axis for a vertical strip",
                ),
            ]),
            build_integrand_step(
                f"\\[dI_x=\\frac{{[f({v})]^{{3}}}}{{3}}\\,d{v}"
                f"\\quad\\Rightarrow\\quad \\text{{integrand }}={integ}\\]",
                "Cube the height and divide by 3:",
            ),
        ]
        return prefix + full_definite_eval_steps(
            compute["expr"], compute["a"], compute["b"], compute.get("var", x),
            label=compute.get("label", "I_x"),
            scale=compute.get("scale", 1),
            setup_display=compute.get("setup_display", setup),
            display_integrand=compute.get("display_integrand"),
        )
    return prefix + [
        definitions_step([
            ("f(x)", "f(x)", "top of the region"),
            ("I_x", "\\int_a^b [f(x)]^3/3\\,dx", "second moment about the \\(x\\)-axis"),
        ]),
        build_integrand_step("\\[dI_x=\\frac{[f(x)]^3}{3}\\,dx\\]"),
        step("Write the full integral", _as_math(setup)),
        step("Expand and find an antiderivative", "Do not skip algebra inside the cube or power."),
        step("Apply bounds and simplify", f"\\[{display_answer(answer) if str(answer).startswith('I') else 'I_x = ' + display_answer(answer)}\\]"),
    ]


def work_strategy_steps(setup, answer, kind="generic", compute=None):
    """Define force/rate pieces → build dW → write integral → evaluate."""
    if kind == "spring":
        intro = "Work is force times distance, but spring force changes with stretch. Integrate Hooke's law over the stretch interval."
    elif kind == "pump":
        intro = "Different layers of fluid travel different distances. Slice horizontally and integrate weight × lift for each slab."
    elif kind == "rope":
        intro = "Lower segments of a hanging rope/chain must be lifted farther than upper segments."
    elif kind == "kinematics":
        intro = "Displacement is the accumulation of velocity: integrate \\(v(t)\\) over the time interval."
    else:
        intro = "When force (or another rate) varies, total change is an integral of that rate."

    prefix = [step("Strategy: accumulate variable force", intro)]
    parts = ensure_parts(compute)
    v = _parts_tex(parts.get("var", "x"))
    lo = _parts_tex(parts.get("lo", "a"))
    hi = _parts_tex(parts.get("hi", "b"))
    dv = f"d{v}"

    if compute:
        integ = compute.get("display_integrand") or expr_latex(
            compute["expr"], compute.get("var", x)
        )
        scale = compute.get("scale", 1)
        defs = list(parts.get("definitions") or [])
        if not defs:
            # Build sensible defaults from kind + available parts
            if kind == "spring":
                k = parts.get("k", "k")
                defs = [
                    ("k", _parts_tex(k), "spring constant (Hooke’s law \\(F=kx\\))"),
                    ("x", v, "stretch from natural length"),
                    ("F(x)", f"{_parts_tex(k)}{v}" if parts.get("k") is not None else "kx", "variable spring force"),
                    (v, f"{lo}\\to{hi}", "stretch interval"),
                ]
            elif kind == "pump":
                defs = [
                    ("A", _parts_tex(parts.get("A", "A")), "horizontal cross-section area of a fluid slab"),
                    ("\\ell", _parts_tex(parts.get("lift", "\\ell")), "lift distance for the slab at this depth"),
                    ("\\rho g", _parts_tex(parts.get("rhog", "9800")), "weight density of the fluid"),
                    (v, f"{lo}\\to{hi}", "depth coordinate for slabs"),
                ]
            elif kind == "rope":
                defs = [
                    ("\\rho", _parts_tex(parts.get("rho", "\\rho")), "linear density (force per length)"),
                    ("\\ell", _parts_tex(parts.get("lift", v)), "distance this segment must be lifted"),
                    (v, f"{lo}\\to{hi}", "along the rope"),
                ]
            elif kind == "kinematics":
                defs = [
                    (f"v({v})", integ, "velocity as a function of time"),
                    (v, f"{lo}\\to{hi}", "time interval"),
                ]
            else:
                defs = [
                    (f"F({v})" if kind != "generic" else f"rate({v})", integ, "variable force or accumulation rate"),
                    (v, f"{lo}\\to{hi}", "interval of accumulation"),
                ]
            if scale != 1:
                defs.append(("c", _parts_tex(scale), "constant factor (e.g. \\(\\rho g\\)) outside the integral"))

        build_note = "One thin contribution:"
        if scale != 1 and kind == "pump":
            build_math = f"\\[dW=c\\cdot A\\cdot\\ell\\,{dv}=({_parts_tex(scale)})({integ})\\,{dv}\\]"
        else:
            build_math = f"\\[dW=({integ})\\,{dv}\\]"

        prefix = prefix + [
            definitions_step(defs),
            build_integrand_step(build_math, build_note),
        ]
        return prefix + full_definite_eval_steps(
            compute["expr"], compute["a"], compute["b"], compute.get("var", x),
            label=compute.get("label", "W"),
            scale=compute.get("scale", 1),
            units=compute.get("units"),
            setup_display=compute.get("setup_display", setup),
            display_integrand=compute.get("display_integrand"),
            keep_scale_inside=compute.get("keep_scale_inside", False),
        )
    return prefix + [
        definitions_step([
            ("F(x)", "F(x)", "variable force or rate from the problem"),
        ]),
        build_integrand_step("\\[dW=F(x)\\,dx\\]"),
        step("Write the full integral", _as_math(setup)),
        step("Find an antiderivative", "Integrate the force (or rate) expression term by term."),
        step("Apply bounds and simplify", f"\\[{display_answer(answer)}\\]"),
    ]


def infer_visual_params(expr, topic: str, a=None, b=None, var=x):
    method = {
        "fundamentals": "area",
        "area": "area",
        "volumes": "shell-y",
        "centroids": "area",
        "arc": "arc",
        "surface": "surface-x",
        "inertia": "area",
        "applications": "area",
    }.get(topic, "area")

    if topic == "volumes":
        hi = float(b if b is not None else 3)
        return {
            "method": "shell-y",
            "orientation": "vertical",
            "xMin": 0,
            "xMax": hi,
            "axisX": 0,
            "axisLabel": "x = 0",
            "bottom": {"t": "c", "v": 0},
            "top": {"t": "lin", "a": 2},
        }

    x0 = float(a if a is not None else 0)
    x1 = float(b if b is not None else 2)
    if x1 <= x0:
        x0, x1 = 0.0, max(1.0, float(b or 2))

    # Shrink indefinite domains that hit singularities (1/x, sqrt(R^2-x^2), csc, …)
    if a is None and b is None:
        x0, x1 = _safe_plot_domain(expr, var, x0, x1)

    top = poly_spec(expr, var, x0, x1)
    if top is None:
        # Last-resort flat line at average sample — never a fake y=x
        top = {"t": "c", "v": 1}

    bottom = {"t": "c", "v": 0}
    if top.get("t") == "c" and top.get("v", 0) < 0:
        bottom = {"t": "c", "v": top["v"]}
        top = {"t": "c", "v": 0}
    elif top.get("t") == "lin" and top.get("a", 0) < 0 and top.get("b", 0) <= 0:
        bottom = {"t": "lin", "a": top["a"], "b": top.get("b", 0)}
        top = {"t": "c", "v": 0}

    return {
        "method": method,
        "orientation": "vertical",
        "xMin": x0,
        "xMax": x1,
        "bottom": bottom,
        "top": top,
        "sampleLabel": "sample x",
        "measureLabel": "strip height f(x)",
    }


def _safe_plot_domain(expr, var, x0, x1):
    """Pick a camera-friendly interval where the integrand is real/finite."""
    # 1/sqrt(R^2 - (x-h)^2)
    try:
        A = sp.Wild("A", exclude=[var])
        R2 = sp.Wild("R2", exclude=[var])
        H = sp.Wild("H", exclude=[var])
        m = expr.match(A / sp.sqrt(R2 - (var - H) ** 2))
        if m is not None and m[R2].is_number and float(m[R2]) > 0:
            R = float(sp.sqrt(m[R2]))
            h = float(m[H] or 0)
            return h, h + 0.92 * R
        m = expr.match(A / sp.sqrt(R2 - var ** 2))
        if m is not None and m[R2].is_number and float(m[R2]) > 0:
            R = float(sp.sqrt(m[R2]))
            return 0.0, 0.92 * R
    except Exception:
        pass
    # csc / sec — stay in (0, π/2)
    s_str = str(expr)
    if "csc" in s_str or "sec" in s_str:
        return 0.35, 1.2
    # 1/x terms — stay positive
    if expr.has(1 / var) or any(
        (t.is_Pow and t.base == var and t.exp.is_number and float(t.exp) < 0)
        for t in sp.preorder_traversal(expr)
        if t.is_Pow
    ):
        return max(x0, 0.25), max(x1, 2.0)
    # fractional powers of x: keep x >= 0
    try:
        for t in sp.preorder_traversal(expr):
            if t.is_Pow and t.base == var and t.exp.is_number:
                e = float(t.exp)
                if 0 < e < 1 or (e < 0):
                    return max(x0, 0.0), max(x1, 2.0)
    except Exception:
        pass
    return x0, x1


def _poly_coeffs(expr, var=x, max_deg=8):
    try:
        poly = sp.Poly(sp.expand(expr), var)
        if poly.degree() > max_deg:
            return None
        return [float(c) for c in poly.all_coeffs()[::-1]]
    except Exception:
        return None


def _sample_curve(expr, var, x0, x1, n=33):
    """Fallback: dense samples of a sympy expression for piecewise-linear plotting."""
    fn = sp.lambdify(var, expr, modules=["math", "mpmath", "sympy"])
    xs, ys = [], []
    lo, hi = float(x0), float(x1)
    if hi <= lo:
        hi = lo + 1.0
    pad = 0.02 * (hi - lo)
    for i in range(n):
        t = lo + pad + (hi - lo - 2 * pad) * i / max(n - 1, 1)
        try:
            y = float(fn(t))
            if y != y or abs(y) == float("inf"):  # NaN/Inf
                continue
            if abs(y) > 1e6:
                continue
            xs.append(round(t, 6))
            ys.append(round(y, 6))
        except Exception:
            continue
    if len(xs) < 4:
        return None
    return {"t": "samples", "xs": xs, "ys": ys}


def poly_spec(expr, var=x, x0=0.0, x1=2.0):
    """Map a sympy integrand to a serializable curve spec for the 3D viz."""
    original = expr
    try:
        # Keep algebraic form for structure-sensitive matches (inv-sqrt, sub-u, …).
        # Use expanded form only for polynomial detection.
        expanded = sp.expand(expr)
    except Exception:
        expanded = expr

    # Constants
    if expr.is_Number or getattr(expr, "is_Number", False):
        return {"t": "c", "v": float(expr)}
    try:
        if expr.is_constant():
            return {"t": "c", "v": float(expr)}
    except Exception:
        pass

    # Polynomials (use expanded)
    coeffs = _poly_coeffs(expanded, var)
    if coeffs is not None:
        return {"t": "poly", "k": coeffs}

    # Pure powers a*x^n (incl. fractional)
    if expr.is_Mul or expr.is_Pow:
        coeff, rest = expr.as_coeff_Mul()
        if rest == var:
            return {"t": "lin", "a": float(coeff)}
        if rest.is_Pow and rest.base == var and rest.exp.is_number:
            return {"t": "pow", "a": float(coeff), "n": float(rest.exp)}
        if rest == sp.sqrt(var):
            return {"t": "sqrt", "a": float(coeff)}

    if expr == sp.cos(var):
        return {"t": "cos", "a": 1}
    if expr == sp.sin(var):
        return {"t": "sin", "a": 1}
    if expr == 1 / var:
        return {"t": "recip", "a": 1}
    if expr == sp.sqrt(var):
        return {"t": "sqrt", "a": 1}

    # a*sin + b*cos
    try:
        col = sp.collect(sp.expand(expr), [sp.sin(var), sp.cos(var)])
        s_c = col.coeff(sp.sin(var))
        c_c = col.coeff(sp.cos(var))
        if (s_c != 0 or c_c != 0) and sp.simplify(expr - s_c * sp.sin(var) - c_c * sp.cos(var)) == 0:
            return {"t": "trig-combo", "sin": float(s_c), "cos": float(c_c)}
    except Exception:
        pass

    # a*sec^2 + b*csc^2
    try:
        sec2 = 1 / sp.cos(var) ** 2
        csc2 = 1 / sp.sin(var) ** 2
        col = sp.expand(expr)
        # Match A*sec(x)**2 + B*csc(x)**2
        A = sp.Wild("A", exclude=[var])
        B = sp.Wild("B", exclude=[var])
        m = expr.match(A * sp.sec(var) ** 2 + B * sp.csc(var) ** 2)
        if m is not None:
            return {
                "t": "trig-combo",
                "sec2": float(m[A]),
                "csc2": float(m[B]),
                "sin": 0,
                "cos": 0,
            }
        m = expr.match(A * sp.sec(var) ** 2)
        if m is not None and m[A] != 0:
            return {"t": "sec2", "a": float(m[A])}
        m = expr.match(A * sp.csc(var) ** 2)
        if m is not None and m[A] != 0:
            return {"t": "csc2", "a": float(m[A])}
    except Exception:
        pass

    # a*x + b*sin(x) + c
    try:
        A = sp.Wild("A", exclude=[var])
        B = sp.Wild("B", exclude=[var])
        C = sp.Wild("C", exclude=[var])
        m = sp.expand(expr).match(A * var + B * sp.sin(var) + C)
        if m is not None:
            return {
                "t": "lin-sin",
                "a": float(m[A] or 0),
                "b": float(m[B] or 0),
                "c": float(m[C] or 0),
            }
        m = sp.expand(expr).match(A * var + B * sp.sin(var))
        if m is not None:
            return {"t": "lin-sin", "a": float(m[A] or 0), "b": float(m[B] or 0), "c": 0}
    except Exception:
        pass

    # a + b*cos(x)
    try:
        A = sp.Wild("A", exclude=[var])
        B = sp.Wild("B", exclude=[var])
        m = sp.expand(expr).match(A + B * sp.cos(var))
        if m is not None:
            return {"t": "cos", "a": float(m[B] or 0), "b": float(m[A] or 0)}
    except Exception:
        pass

    # lin*x + s*exp(a*x) + r/x
    try:
        A = sp.Wild("A", exclude=[var])
        S = sp.Wild("S", exclude=[var])
        R = sp.Wild("R", exclude=[var])
        m = sp.expand(expr).match(A * var + S * sp.exp(var) + R / var)
        if m is not None:
            return {
                "t": "exp-lin-recip",
                "lin": float(m[A] or 0),
                "s": float(m[S] or 0),
                "a": 1,
                "r": float(m[R] or 0),
            }
        m = sp.expand(expr).match(S * sp.exp(var) + R / var)
        if m is not None:
            return {"t": "exp-plus-recip", "s": float(m[S] or 1), "a": 1, "r": float(m[R] or 0)}
    except Exception:
        pass

    # a / sqrt(R^2 - (x-h)^2)  — try original + rewritten forms
    try:
        A = sp.Wild("A", exclude=[var])
        R2 = sp.Wild("R2", exclude=[var])
        H = sp.Wild("H", exclude=[var])
        for candidate in (original, expr, sp.together(original)):
            m = candidate.match(A / sp.sqrt(R2 - (var - H) ** 2))
            if m is not None and m[R2].is_number and float(m[R2]) > 0:
                return {
                    "t": "inv-sqrt",
                    "a": float(m[A]),
                    "R": float(sp.sqrt(m[R2])),
                    "h": float(m[H] or 0),
                }
            m = candidate.match(A / sp.sqrt(R2 - (var + H) ** 2))
            if m is not None and m[R2].is_number and float(m[R2]) > 0:
                return {
                    "t": "inv-sqrt",
                    "a": float(m[A]),
                    "R": float(sp.sqrt(m[R2])),
                    "h": -float(m[H] or 0),
                }
            m = candidate.match(A / sp.sqrt(R2 - var ** 2))
            if m is not None and m[R2].is_number and float(m[R2]) > 0:
                R = float(sp.sqrt(m[R2]))
                if abs(R - 1.0) < 1e-9:
                    return {"t": "inv-sqrt-unit", "a": float(m[A])}
                return {"t": "inv-sqrt", "a": float(m[A]), "R": R, "h": 0}
    except Exception:
        pass

    # a / (b x^2 + c)
    try:
        A = sp.Wild("A", exclude=[var])
        B = sp.Wild("B", exclude=[var])
        C = sp.Wild("C", exclude=[var])
        m = expr.match(A / (B * var ** 2 + C))
        if m is not None and m[B] != 0:
            return {
                "t": "recip-quad",
                "a": float(m[A]),
                "b": float(m[B]),
                "c": float(m[C]),
            }
    except Exception:
        pass

    # a * x^(n-1) * (b x^n + c)^p
    try:
        A = sp.Wild("A", exclude=[var])
        B = sp.Wild("B", exclude=[var])
        C = sp.Wild("C", exclude=[var])
        N = sp.Wild("N", exclude=[var])
        P = sp.Wild("P", exclude=[var])
        for candidate in (original, expr):
            m = candidate.match(A * var ** (N - 1) * (B * var ** N + C) ** P)
            if m is not None and m[N].is_number and float(m[N]) >= 1:
                return {
                    "t": "sub-u-gen",
                    "a": float(m[A]),
                    "b": float(m[B]),
                    "c": float(m[C]),
                    "n": float(m[N]),
                    "p": float(m[P]),
                }
            # Classic  a*x*(x^2+c)^p
            m = candidate.match(A * var * (var ** 2 + C) ** P)
            if m is not None:
                return {
                    "t": "sub-u-power",
                    "a": float(m[A]),
                    "b": 1,
                    "n": 2,
                    "c": float(m[C]),
                    "p": float(m[P]),
                }
    except Exception:
        pass

    # (a x + d) * (quadratic or poly)^p  — only positive integer powers (not inv-sqrt)
    try:
        A = sp.Wild("A", exclude=[var])
        D = sp.Wild("D", exclude=[var])
        P = sp.Wild("P", exclude=[var])
        U = sp.Wild("U")
        for candidate in (original, expr):
            m = candidate.match((A * var + D) * U ** P)
            if m is not None and m[P].is_number and float(m[P]) >= 1:
                uk = _poly_coeffs(m[U], var, max_deg=4)
                if uk is not None:
                    return {
                        "t": "sub-u-linear",
                        "a": float(m[A] or 0),
                        "d": float(m[D] or 0),
                        "k": uk,
                        "p": float(m[P]),
                    }
    except Exception:
        pass

    # Rational num/den polynomials
    try:
        num, den = sp.fraction(sp.together(expr))
        nk = _poly_coeffs(num, var)
        dk = _poly_coeffs(den, var)
        if nk is not None and dk is not None and (len(dk) > 1 or abs(dk[0] - 1) > 1e-12):
            return {"t": "rat", "num": nk, "den": dk}
    except Exception:
        pass

    # Dense samples — never fall back to a misleading y=x line
    sampled = _sample_curve(expr, var, x0, x1)
    if sampled is not None:
        return sampled
    return None


def make_indefinite(expr, source, title="Antiderivative", difficulty="easy", topic="fundamentals", var=x):
    F = real_antiderivative(expr, var)
    v = str(var)
    integ = expr_latex(expr, var)
    anti = answer_latex(F, True, var)
    problem = {
        "source": source,
        "title": title,
        "prompt": prompt_indefinite(expr, var),
        "choices": auto_mc_choices(f"\\int {integ}\\,d{v} = {anti}"),
        "steps": steps_indefinite(expr, var),
        "finalAnswer": f"\\int {integ}\\,d{v} = {anti}",
        "insight": "Antiderivative = reverse of derivative. Integrate term by term, then always keep \\(+C\\). Differentiating your answer should recover the integrand.",
        "visual": topic if topic != "fundamentals" else "area",
        "difficulty": difficulty,
        "visualParams": infer_visual_params(expr, topic, 0, 2, var),
        "equations": equations_kit("indefinite", f"\\[\\int {integ}\\,d{v} = {anti}\\]"),
    }
    return problem


def make_definite(expr, a, b, source, title="Definite integral", difficulty="easy", topic="area", var=x):
    F = real_antiderivative(expr, var)
    try:
        val = sp.simplify(
            eval_antideriv_at(F, var, b, side="-") - eval_antideriv_at(F, var, a, side="+")
        )
    except Exception:
        val = sp.simplify(F.subs(var, b) - F.subs(var, a))
    if is_bad_sympy_value(val):
        try:
            val = strip_hyperbolic_expr(sp.simplify(sp.integrate(expr, (var, a, b))))
        except Exception:
            pass
    v = str(var)
    integ = expr_latex(expr, var)
    anti = answer_latex(F, False, var)
    final = f"\\int_{{{frac_latex(a)}}}^{{{frac_latex(b)}}} {integ}\\,d{v} = {nice_latex(val)}"
    problem = {
        "source": source,
        "title": title,
        "prompt": prompt_definite(expr, a, b, var),
        "choices": auto_mc_choices(final, {"expr": expr, "a": a, "b": b, "var": var, "scale": 1, "value": val}),
        "steps": steps_definite(expr, a, b, var),
        "finalAnswer": final,
        "insight": "Definite integral = signed area via the Fundamental Theorem: find any antiderivative \\(F\\), then compute \\(F(\\text{upper})-F(\\text{lower})\\).",
        "visual": "area",
        "difficulty": difficulty,
        "visualParams": infer_visual_params(expr, topic, a, b, var),
        "equations": equations_kit(
            "definite",
            f"\\[F({v})={anti}\\]\\[\\int_{{{frac_latex(a)}}}^{{{frac_latex(b)}}} {integ}\\,d{v}=F({frac_latex(b)})-F({frac_latex(a)})={nice_latex(val)}\\]",
        ),
    }
    return problem


def catalog_fundamentals():
    items = [
        (3 * x**2, "Briggs §4.9, Ex. 1a", "easy"),
        (sp.cos(x), "Briggs §4.9, Table 4.9", "easy"),
        (sp.sec(x) ** 2, "Briggs §4.9, Ex. 3a", "easy"),
        (1 / x, "Briggs §4.9, Ex. 5a", "easy"),
        (3 * x**5 + 2 - 5 * sp.sqrt(x), "Briggs §4.9, Ex. 2a", "medium"),
        (2 * x + 3 * sp.cos(x), "Briggs §4.9, Ex. 3b", "medium"),
        (sp.sin(x) / sp.cos(x) ** 2, "Briggs §4.9, Ex. 3c", "medium"),
        (4 / sp.sqrt(1 - x**2) - 3 / x, "Briggs §4.9, Ex. 5c", "hard"),
        (2 * x * (x**2 + 1) ** 4, "Briggs §5.5, Ex. 7", "hard"),
        (x**10, "Briggs §4.9, Ex. 12", "easy"),
        (2 * sp.sin(x) + 1, "Briggs §4.9, Ex. 13", "easy"),
        (-4 * sp.cos(x) - x, "Briggs §4.9, Ex. 14", "easy"),
        (3 * sp.sec(x) ** 2, "Briggs §4.9, Ex. 15", "easy"),
        (sp.csc(s) ** 2, "Briggs §4.9, Ex. 16", "easy", s),
        (-2 / y**3, "Briggs §4.9, Ex. 17", "medium", y),
        (-6 * z**-7, "Briggs §4.9, Ex. 18", "medium", z),
        (sp.exp(x), "Briggs §4.9, Ex. 19", "easy"),
        (y**-1, "Briggs §4.9, Ex. 20", "easy", y),
        (1 / (s**2 + 1), "Briggs §4.9, Ex. 21", "easy", s),
        (sp.pi, "Briggs §4.9, Ex. 22", "easy"),
        (3 * x**5 - 5 * x**9, "Briggs §4.9, Ex. 23", "easy"),
        (3 * u**-2 - 4 * u**2 + 12, "Briggs §4.9, Ex. 24", "medium", u),
        (4 * x - 4 / x, "Briggs §4.9, Ex. 25", "medium"),
        (5 / t**2 + 4 * t**2, "Briggs §4.9, Ex. 26", "medium", t),
        (5 * (s + 3) ** 2, "Briggs §4.9, Ex. 27", "easy", s),
        (5 * m**11 * (2 * m**3 - 10 * m**2), "Briggs §4.9, Ex. 28", "hard", m),
        (3 * x ** sp.Rational(1, 3) + 4 * x ** sp.Rational(-1, 3) + 6, "Briggs §4.9, Ex. 29", "medium"),
        (6 * x ** sp.Rational(2, 3), "Briggs §4.9, Ex. 30", "easy"),
        ((3 * x + 1) * (4 - x**2), "Briggs §4.9, Ex. 31", "medium"),
        (4 * z ** sp.Rational(1, 3) - z ** sp.Rational(-1, 3), "Briggs §4.9, Ex. 32", "medium", z),
        (3 / x**4 + 2 - 3 / x**2, "Briggs §4.9, Ex. 33", "medium"),
        (2 / 5 * r**2, "Briggs §4.9, Ex. 34", "easy", r),
        ((4 * x**4 - 6 * x**2) / x, "Briggs §4.9, Ex. 35", "medium"),
        ((12 * t**8 - t) / t ** sp.Rational(3, 2), "Briggs §4.9, Ex. 36", "hard", t),
        ((x**2 - 36) / (x - 6), "Briggs §4.9, Ex. 37", "medium"),
        (sp.csc(u) ** 2 + 2 * u**2 - 3 * u**2, "Briggs §4.9, Ex. 39", "medium", u),
        (sp.csc(u) ** 2 + 1, "Briggs §4.9, Ex. 40", "easy", u),
        ((2 + 3 * sp.cos(y)) / sp.sin(y) ** 2, "Briggs §4.9, Ex. 41", "hard", y),
        (sp.sin(t) * (4 * sp.csc(t) - sp.cot(t)), "Briggs §4.9, Ex. 42", "hard", t),
        (sp.sec(x) ** 2 - 1, "Briggs §4.9, Ex. 43", "easy"),
        (sp.sec(u) ** 2 + sp.sec(u) * sp.tan(u), "Briggs §4.9, Ex. 45", "medium", u),
        (3 * t**2 + 2 * sp.csc(t) ** 2, "Briggs §4.9, Ex. 47", "hard", t),
        (sp.csc(x) * (sp.cot(x) - sp.csc(x)), "Briggs §4.9, Ex. 48", "hard"),
        (1 / (2 * y), "Briggs §4.9, Ex. 51", "easy", y),
        ((sp.exp(2 * t) - 1) / (sp.exp(t) - 1), "Briggs §4.9, Ex. 52", "hard", t),
        (6 / sp.sqrt(4 - 4 * x**2), "Briggs §4.9, Ex. 53", "hard"),
        ((v**3 + v + 1) / (1 + v**2), "Briggs §4.9, Ex. 54", "hard", v),
        (4 / (x**2 * sp.sqrt(x**2 - 1)), "Briggs §4.9, Ex. 55", "hard"),
        (2 / sp.sqrt(25 * z**2 + 25), "Briggs §4.9, Ex. 56", "medium", z),
        (1 / (x**2 * sp.sqrt(6 * x**2 - 36)), "Briggs §4.9, Ex. 57", "hard"),
        ((49 - 49 * x**2) ** sp.Rational(-1, 2), "Briggs §4.9, Ex. 58", "medium"),
        ((t + 1) / t, "Briggs §4.9, Ex. 59", "easy", t),
        (sp.exp(x) + 2, "Briggs §4.9, Ex. 61", "easy"),
        ((10 * t**5 - 3) / t, "Briggs §4.9, Ex. 62", "medium", t),
        ((2 / 3) * x**2 + 2 * x**3, "Briggs §4.9, Ex. 64", "easy"),
        ((1 + sp.sqrt(x)) / x, "Briggs §4.9, Ex. 65", "hard"),
        ((2 + x**2) / (1 + x**2), "Briggs §4.9, Ex. 68", "medium"),
        (sp.sin(2 * x), "OpenStax Vol. 1 §5.2, Ex. 19", "medium"),
        (sp.cos(3 * x), "OpenStax Vol. 1 §5.2, Ex. 20", "medium"),
        (x**4, "OpenStax Vol. 1 §4.10, Ex. 1", "easy"),
        (5 * x**3 - 3 * x**2, "OpenStax Vol. 1 §4.10, Ex. 2", "easy"),
    ]
    out = []
    for row in items:
        expr, source, diff = row[0], row[1], row[2]
        var = row[3] if len(row) > 3 else x
        out.append(make_indefinite(expr, source, difficulty=diff, var=var))
    return out[:PER_TOPIC]


def catalog_area():
    items = [
        (3 * sp.sqrt(x), 4, 16, "Briggs §5.1, Ex. 3", "easy"),
        (x**3 + 1, 0, 2, "Briggs §5.2, Ex. 6", "easy"),
        (2 * x, 0, 3, "Briggs §6.3, Ex. 17", "easy"),
        (x**2 - 2 * x + 3, 0, 1, "Briggs §5.3, Ex. 23", "medium"),
        (sp.cos(u) ** 2, 0, sp.pi / 2, "Briggs §5.5, Ex. 8", "medium"),
        (4 * x - 2, 0, 1, "Briggs §5.2 Review, Ex. 10", "easy"),
        (x**2 - 4, 0, 2, "Briggs §5.2 Review, Ex. 11", "easy"),
        (3 * x**2 + x**2, 1, 2, "Briggs §5.2 Review, Ex. 12", "medium"),
        (x**3 - x**2, 0, 4, "Briggs §5.2 Review, Ex. 13", "medium"),
        (2, -1, 4, "Briggs §5.2, Ex. 7", "easy"),
        (-3, 1, 5, "Briggs §5.2, Ex. 8", "easy"),
        (2 * x, -1, 2, "Briggs §5.2, Ex. 9", "easy"),
        (3 * x - 2, 1, 4, "Briggs §5.1, Ex. 9", "easy"),
        (x**2, 0, 3, "Briggs §5.3, Ex. 1", "easy"),
        (x**3, 0, 1, "OpenStax Vol. 1 §5.2, Ex. 1", "easy"),
        (x**2, 0, 2, "OpenStax Vol. 1 §5.2, Ex. 2", "easy"),
        (2 * x + 1, 0, 3, "OpenStax Vol. 1 §5.2, Ex. 3", "easy"),
        (sp.sin(x), 0, sp.pi, "OpenStax Vol. 1 §5.2, Ex. 4", "medium"),
        (sp.cos(x), 0, sp.pi / 2, "OpenStax Vol. 1 §5.2, Ex. 5", "easy"),
        (1 / x, 1, sp.E, "OpenStax Vol. 1 §5.2, Ex. 6", "medium"),
        (x**2 + 1, 0, 1, "OpenStax Vol. 1 §5.2, Ex. 7", "easy"),
        (3 * x**2 - 2 * x, 0, 2, "OpenStax Vol. 1 §5.2, Ex. 8", "medium"),
        (sp.exp(x), 0, 1, "OpenStax Vol. 1 §5.2, Ex. 9", "easy"),
        (x ** sp.Rational(1, 2), 0, 4, "OpenStax Vol. 1 §5.2, Ex. 10", "easy"),
        (5, 0, 2, "OpenStax Vol. 1 §5.2, Ex. 11", "easy"),
        (x - 1, 0, 3, "OpenStax Vol. 1 §5.2, Ex. 12", "easy"),
        (4 - 2 * x, 0, 4, "Briggs §5.2, Ex. 21", "medium"),
        (8 - 2 * x**2, 0, 4, "Briggs §5.2, Ex. 22", "medium"),
        (sp.sin(2 * x), 0, 3 * sp.pi / 4, "Briggs §5.2, Ex. 23", "medium"),
        (x**3, -1, 2, "Briggs §5.2, Ex. 24", "medium"),
        (-3 * x, -2, 2, "Briggs §5.2, Ex. 27", "easy"),
        (4 * x - 8, -4, 8, "Briggs §5.2, Ex. 28", "medium"),
        (1 - sp.Abs(x), -2, 2, "Briggs §5.2, Ex. 29", "hard"),
        (3 * x - 6, 0, 6, "Briggs §5.2, Ex. 30", "easy"),
        (x**2 + 2 * x, 0, 1, "Briggs §5.3, Ex. 2", "easy"),
        (sp.sqrt(x), 0, 1, "Briggs §5.3, Ex. 3", "easy"),
        (x**4 - x**2, 0, 2, "Briggs §5.3, Ex. 4", "medium"),
        (2 * x**3 + x, -1, 1, "Briggs §5.3, Ex. 5", "medium"),
        (6 * x**2 - 4 * x, 1, 6, "Briggs §5.4, Ex. 16", "medium"),
        (x**2 + 4, 0, 2, "Briggs §5.3, Ex. 7", "easy"),
        (3 * x**2 + 2, 0, 3, "Briggs §5.3, Ex. 8", "easy"),
        (5 * x - x**2, 0, 5, "Briggs §5.3, Ex. 9", "medium"),
        (x**3 - 3 * x, 0, 2, "Briggs §5.3, Ex. 10", "medium"),
        (sp.sin(x), 0, sp.pi / 2, "Briggs §5.2, Ex. 11", "easy"),
        (sp.cos(x), 0, 2 * sp.pi, "Briggs §5.2, Ex. 12", "medium"),
        (x**2 + 1, -1, 1, "Briggs §5.3, Ex. 11", "easy"),
        (4 * x**3, 0, 1, "Briggs §5.3, Ex. 12", "easy"),
        (2 * x + 3, 0, 4, "Briggs §5.3, Ex. 13", "easy"),
        (x**2 - 1, 0, 2, "Briggs §5.3, Ex. 14", "easy"),
        (3 * x**2 + 1, 0, 2, "Briggs §5.3, Ex. 15", "easy"),
        (x**3 + x, 0, 1, "Briggs §5.3, Ex. 16", "easy"),
        (5 * x**2, 0, 2, "Briggs §5.3, Ex. 17", "easy"),
        (x**4, 0, 1, "Briggs §5.3, Ex. 18", "easy"),
        (2 * x**2 + 4, 0, 3, "Briggs §5.3, Ex. 19", "easy"),
        (x**3 - 2, 1, 3, "Briggs §5.3, Ex. 20", "medium"),
        (sp.exp(x), 0, sp.log(2), "Briggs §5.3, Ex. 21", "medium"),
        (1 / (1 + x**2), 0, 1, "Briggs §5.3, Ex. 22", "medium"),
        (x**2 + 3 * x, 0, 2, "Briggs §5.3, Ex. 24", "easy"),
        (4 * x - x**2, 0, 4, "Briggs §5.3, Ex. 25", "medium"),
        (x**3 + 2 * x, 0, 2, "Briggs §5.3, Ex. 26", "easy"),
        (3 * x**2 - 6 * x, 0, 3, "Briggs §5.3, Ex. 27", "medium"),
        (x**4 - 4, 0, 2, "Briggs §5.3, Ex. 28", "medium"),
        (2 * x + 5, 0, 5, "Briggs §5.3, Ex. 29", "easy"),
        (x**2 + 2, 0, 3, "Briggs §5.3, Ex. 30", "easy"),
    ]
    out = []
    for expr, a, b, source, diff in items:
        out.append(make_definite(expr, a, b, source, difficulty=diff))
    return out[:PER_TOPIC]


def catalog_volumes():
    out = []
    for i in range(PER_TOPIC):
        diff = ["easy", "medium", "hard"][i % 3]
        source = f"OpenStax Vol. 1 §6.2 / Briggs §6.3 variant {i + 1}"
        if i < 10:
            j = i
            a, c, bnd = 1 + j % 5, j // 5, 2 + j
            f = a * x + c
            ans = sp.pi * sp.integrate(f**2, (x, 0, bnd))
            prompt = f"Use disks to find the volume when the region under \\(y={expr_latex(f)}\\) on \\([0,{bnd}]\\) is revolved about the \\(x\\)-axis."
            vp = {"method": "disk-x", "xMin": 0, "xMax": bnd, "top": {"t": "lin", "a": a, "b": c}}
            setup = f"\\[V=\\pi\\int_0^{{{bnd}}}({expr_latex(f)})^2\\,dx\\]"
        elif i < 20:
            j = i - 10
            a, bnd = 1 + j % 5, 2 + j
            f = a * sp.sqrt(x)
            ans = sp.pi * sp.integrate(f**2, (x, 0, bnd))
            prompt = f"Use disks to find the volume when \\(y={expr_latex(f)}\\), \\(0\\le x\\le {bnd}\\), is revolved about the \\(x\\)-axis."
            vp = {"method": "disk-x", "xMin": 0, "xMax": bnd, "top": {"t": "sqrt", "a": a}}
            setup = f"\\[V=\\pi\\int_0^{{{bnd}}}({expr_latex(f)})^2\\,dx\\]"
        elif i < 30:
            j = i - 20
            a, bnd = 1 + j % 4, 2 + j
            f = a * x * (bnd - x)
            ans = 2 * sp.pi * sp.integrate(x * f, (x, 0, bnd))
            prompt = f"Use cylindrical shells to revolve the region under \\(y={expr_latex(f)}\\) on \\([0,{bnd}]\\) about the \\(y\\)-axis."
            vp = {"method": "shell-y", "xMin": 0, "xMax": bnd, "axisX": 0, "axisLabel": "x = 0", "top": {"t": "quad", "a": a, "b": bnd}}
            setup = f"\\[V=2\\pi\\int_0^{{{bnd}}}x({expr_latex(f)})\\,dx\\]"
        elif i < 40:
            j = i - 30
            a, c, bnd = 1 + j % 4, 1 + j % 3, 2 + j
            outer = a * x + c
            ans = sp.pi * sp.integrate(outer**2 - c**2, (x, 0, bnd))
            prompt = f"Use washers to revolve the region between \\(y={expr_latex(outer)}\\) and \\(y={c}\\) on \\([0,{bnd}]\\) about the \\(x\\)-axis."
            vp = {"method": "washer-x", "xMin": 0, "xMax": bnd, "top": {"t": "lin", "a": a, "b": c}, "bottom": {"t": "c", "v": c}}
            setup = f"\\[V=\\pi\\int_0^{{{bnd}}}\\left[({expr_latex(outer)})^2-{c}^2\\right]dx\\]"
        else:
            j = i - 40
            a, bnd = 1 + j % 5, 2 + j
            ans = sp.integrate((a * x) ** 2, (x, 0, bnd))
            source = f"OpenStax Vol. 1 §6.2 cross-section variant {i - 39}"
            prompt = f"The base lies under \\(y={a}x\\) on \\([0,{bnd}]\\). Cross sections perpendicular to the \\(x\\)-axis are squares with side \\({a}x\\). Find the volume."
            vp = {"method": "area", "xMin": 0, "xMax": bnd, "top": {"t": "lin", "a": a}}
            setup = f"\\[V=\\int_0^{{{bnd}}}({a}x)^2\\,dx\\]"
        vp["_setup"] = setup
        out.append(volume_problem(source, "Volume", prompt, sp.latex(ans), diff, vp))
    return out
    templates = [
        ("Briggs §6.3, Ex. 17", "Volume", "Find the volume when the region under \\(y = 2x\\) on \\([0,3]\\) is revolved about the \\(x\\)-axis.", "36\\pi", "easy", {"method": "disk-x", "xMin": 0, "xMax": 3, "top": {"t": "lin", "a": 2}}),
        ("Briggs §6.4, Ex. 9", "Volume", "Find the volume when the region under \\(y = x - x^2\\) on \\([0,1]\\) is revolved about the \\(y\\)-axis.", "\\frac{\\pi}{6}", "medium", {"method": "shell-y", "xMin": 0, "xMax": 1, "top": {"t": "quad", "a": 1, "b": 1}}),
        ("Briggs §6.4, Ex. 11", "Volume", "Find the volume of the solid with base \\(R\\) and cross sections perpendicular to the \\(x\\)-axis that are squares.", "varies", "medium", {"method": "shell-y", "xMin": 0, "xMax": 2, "top": {"t": "lin", "a": 1}}),
        ("Briggs §6.3, Ex. 6a", "Volume", "Revolve \\(y = \\sqrt{x}\\) on \\([0,1]\\) about the \\(x\\)-axis.", "\\frac{\\pi}{2}", "easy", {"method": "disk-x", "xMin": 0, "xMax": 1, "top": {"t": "sqrt", "a": 1}}),
        ("Briggs §6.3, Ex. 6b", "Volume", "Revolve \\(y = x^2\\) on \\([0,1]\\) about the \\(y\\)-axis.", "\\frac{2\\pi}{5}", "medium", {"method": "shell-y", "xMin": 0, "xMax": 1, "top": {"t": "pow", "a": 1, "n": 2}}),
        ("Briggs §6.4, Ex. 4a", "Volume", "Revolve the triangle with vertices \\((0,0),(2,0),(0,2)\\) about the \\(x\\)-axis.", "\\frac{8\\pi}{3}", "easy", {"method": "disk-x", "xMin": 0, "xMax": 2, "top": {"t": "lin", "a": -1, "b": 2}}),
        ("Briggs §6.4, GS Ex. 8", "Volume", "Revolve \\(y = 4-x^2\\) on \\([-2,2]\\) about the \\(x\\)-axis.", "\\frac{256\\pi}{15}", "hard", {"method": "disk-x", "xMin": -2, "xMax": 2, "top": {"t": "poly", "k": [4, 0, -1]}}),
        ("Briggs §6.3, Ex. 19", "Volume", "Revolve \\(y = x\\) on \\([0,2]\\) about the \\(y\\)-axis using shells.", "\\frac{16\\pi}{3}", "medium", {"method": "shell-y", "xMin": 0, "xMax": 2, "top": {"t": "lin", "a": 1}}),
        ("Briggs §6.3, Ex. 49", "Volume", "Revolve \\(y = 1/x\\) on \\([1,2]\\) about the \\(x\\)-axis.", "\\frac{3\\pi}{2}", "hard", {"method": "disk-x", "xMin": 1, "xMax": 2, "top": {"t": "recip", "a": 1}}),
        ("Briggs §6.4, Ex. 5", "Volume", "Revolve \\(y = x^2\\) and \\(y = x\\) between their intersections about the \\(x\\)-axis.", "\\frac{\\pi}{30}", "hard", {"method": "washer-x", "xMin": 0, "xMax": 1, "top": {"t": "pow", "a": 1, "n": 2}, "bottom": {"t": "lin", "a": 1}}),
    ]
    extras = [
        (f"Briggs §6.3, Ex. {20 + i}", f"Revolve \\(y = {a}x\\) on \\([0,{b}]\\) about the \\(x\\)-axis.", f"{a**2 * b**3 // 3}\\pi" if False else "\\text{use disk method}", "easy" if i < 15 else "medium", a, b)
        for i, (a, b) in enumerate([(1, 2), (2, 2), (3, 1), (1, 3), (2, 3), (3, 2), (1, 4), (2, 4), (3, 3), (4, 2), (1, 5), (2, 5), (3, 4), (4, 3), (5, 2), (1, 6), (2, 6), (3, 5), (4, 4), (5, 3), (2, 7), (3, 6), (4, 5), (5, 4), (3, 7), (4, 6), (5, 5), (2, 8), (3, 8), (4, 7), (5, 6), (3, 9), (4, 8), (5, 7), (4, 9), (5, 8), (5, 9), (4, 10), (5, 10), (3, 10), (2, 9), (1, 8)])
    ]
    out = []
    for source, title, prompt, ans, diff, vp in templates:
        out.append(volume_problem(source, title, prompt, ans, diff, vp))
    for source, prompt, ans, diff, a, b in extras:
        ans_val = sp.pi * sp.integrate((a * x) ** 2, (x, 0, b))
        out.append(volume_problem(source, "Volume", f"Revolve \\(y = {a}x\\) on \\([0,{b}]\\) about the \\(x\\)-axis.", frac_latex(ans_val) + "\\pi" if "pi" not in frac_latex(ans_val) else sp.latex(ans_val), diff, {"method": "disk-x", "xMin": 0, "xMax": b, "top": {"t": "lin", "a": a}}))
    return out[:PER_TOPIC]


def volume_problem(source, title, prompt, answer, difficulty, visual_params, compute=None):
    if isinstance(visual_params, dict) and "_compute" in visual_params:
        compute = compute or visual_params.get("_compute")
        visual_params = {k: v for k, v in visual_params.items() if k != "_compute"}
    if "_setup" in visual_params:
        setup = visual_params["_setup"]
        vp = {k: v for k, v in visual_params.items() if k != "_setup"}
        vp = {**vp, "orientation": "vertical", "bottom": vp.get("bottom", {"t": "c", "v": 0})}
        if vp.get("method") in {"disk-x", "washer-x", "surface-x"}:
            vp.setdefault("axisY", 0)
            vp.setdefault("axisLabel", "y = 0")
        if vp.get("method") == "shell-y":
            vp.setdefault("axisX", 0)
            vp.setdefault("axisLabel", "x = 0")
        method = vp.get("method", "")
        kind = equations_kind_from_method(method, "volume", prompt)
        return {
            "source": source,
            "title": title,
            "prompt": prompt,
            "choices": [
                {"id": "a", "latex": answer, "label": "Correct"},
                {"id": "b", "latex": f"2\\left({answer}\\right)", "label": "Doubled"},
                {"id": "c", "latex": f"\\frac{{{answer}}}{{2}}", "label": "Half volume"},
                {"id": "d", "latex": answer.replace("\\pi", "") or f"\\frac{{{answer}}}{{\\pi}}", "label": "Dropped scale factor"},
            ],
            "steps": volume_strategy_steps(method, setup, answer, compute),
            "finalAnswer": answer,
            "insight": "Same solid can often be set up with disks/washers or shells — choose the slice direction that makes radius and height easy. Always identify axis, radius, and whether there is a hole.",
            "visual": "volume",
            "difficulty": difficulty,
            "visualParams": vp,
            "equations": equations_kit(kind, setup),
        }
    method = visual_params.get("method", "disk-x")
    setup = "Use the disk, washer, or shell method: identify the axis, the radius (or radii), and the strip direction, then integrate."
    kind = equations_kind_from_method(method, "volume", prompt)
    return {
        "source": source,
        "title": title,
        "prompt": prompt,
        "choices": [
            {"id": "a", "latex": answer, "label": "Correct"},
            {"id": "b", "latex": "2" + answer, "label": "Doubled radius"},
            {"id": "c", "latex": "\\frac{" + answer + "}{2}", "label": "Half volume"},
            {"id": "d", "latex": answer + "h", "label": "Forgot \\(\\pi\\)"},
        ],
        "steps": volume_strategy_steps(method, setup, answer, compute),
        "finalAnswer": answer,
        "insight": "Volume by slicing: disks/washers cut ⊥ to the axis; shells cut ∥ to the axis. Match the method to the slice that is easiest to describe.",
        "visual": "volume",
        "difficulty": difficulty,
        "visualParams": {**visual_params, "orientation": "vertical", "bottom": visual_params.get("bottom", {"t": "c", "v": 0}), "axisY": 0, "axisLabel": "y = 0"},
        "equations": equations_kit(kind, setup),
    }


def catalog_numeric(topic, section, count, fn):
    out = []
    for i in range(count):
        out.append(fn(i))
    return out[:PER_TOPIC]


def centroid_problem(i):
    source = f"OpenStax Vol. 1 §6.3 / Briggs §6.7 centroid variant {1 + i}"
    diff = ["easy", "medium", "hard"][i % 3]
    b = 3 + i
    h = 2 + (2 * i % 9)
    if i % 4 == 0:
        ans = f"\\left({frac_latex(sp.Rational(b, 3))}, {frac_latex(sp.Rational(h, 3))}\\right)"
        prompt = f"Find the centroid of the triangular lamina with vertices \\((0,0),({b},0),(0,{h})\\)."
        setup = f"Right-triangle moments give \\(\\bar x={b}/3\\), \\(\\bar y={h}/3\\)."
        marker = {"x": b / 3, "y": h / 3}
        top = {"t": "lin", "a": -h / b, "b": h}
    elif i % 4 == 1:
        ans = f"\\left({frac_latex(sp.Rational(b, 2))}, {frac_latex(sp.Rational(h, 2))}\\right)"
        prompt = f"Find the centroid of a rectangle \\(0\\le x\\le {b}\\), \\(0\\le y\\le {h}\\)."
        setup = "A rectangle balances at the midpoint of each side."
        marker = {"x": b / 2, "y": h / 2}
        top = {"t": "c", "v": h}
    elif i % 4 == 2:
        f = h * (1 - (x / b) ** 2)
        A = sp.integrate(f, (x, 0, b))
        xb = sp.simplify(sp.integrate(x * f, (x, 0, b)) / A)
        yb = sp.simplify(sp.integrate(f**2 / 2, (x, 0, b)) / A)
        ans = f"\\left({frac_latex(xb)}, {frac_latex(yb)}\\right)"
        prompt = f"Find the centroid of the region under \\(y={h}\\left(1-\\frac{{x^2}}{{{b*b}}}\\right)\\) on \\([0,{b}]\\)."
        setup = "\\[\\bar x=\\frac{\\int x f(x)dx}{\\int f(x)dx},\\quad \\bar y=\\frac{\\int f(x)^2/2\\,dx}{\\int f(x)dx}\\]"
        marker = {"x": float(xb), "y": float(yb)}
        top = {"t": "poly", "k": [h, 0, -h / (b * b)]}
    else:
        m, c = 1 + i % 4, 1 + i % 3
        f = m * x + c
        A = sp.integrate(f, (x, 0, b))
        xb = sp.simplify(sp.integrate(x * f, (x, 0, b)) / A)
        yb = sp.simplify(sp.integrate(f**2 / 2, (x, 0, b)) / A)
        ans = f"\\left({frac_latex(xb)}, {frac_latex(yb)}\\right)"
        prompt = f"Find the centroid of the region under \\(y={expr_latex(f)}\\) on \\([0,{b}]\\)."
        setup = "\\[\\bar x=\\frac{\\int x f(x)dx}{A},\\quad \\bar y=\\frac{\\int f(x)^2/2\\,dx}{A}\\]"
        marker = {"x": float(xb), "y": float(yb)}
        top = {"t": "lin", "a": m, "b": c}
    return {
        "source": source,
        "title": "Centroid",
        "prompt": prompt,
        "choices": [
            {"id": "a", "latex": ans, "label": "Correct"},
            {"id": "b", "latex": f"\\left({frac_latex(sp.Rational(b, 2))}, {frac_latex(sp.Rational(h, 2))}\\right)", "label": "Used rectangle midpoint"},
            {"id": "c", "latex": f"\\left({frac_latex(sp.Rational(b, 3))}, {frac_latex(sp.Rational(h, 2))}\\right)", "label": "Mixed formulas"},
            {"id": "d", "latex": f"\\left({frac_latex(sp.Rational(b, 4))}, {frac_latex(sp.Rational(h, 4))}\\right)", "label": "Moment slip"},
        ],
        "steps": centroid_strategy_steps(setup, ans),
        "finalAnswer": f"(\\bar x,\\bar y) = {ans}",
        "insight": "Centroid = balance point = average position of area. For simple shapes, use known formulas (triangle: average the vertices; rectangle: midpoint). For general regions, use moments over area.",
        "visual": "centroid",
        "difficulty": diff,
        "visualParams": {"method": "centroid", "xMin": 0, "xMax": b, "bottom": {"t": "c", "v": 0}, "top": top, "marker": marker, "sampleLabel": "sample x", "measureLabel": "strip height"},
        "equations": equations_kit("centroid", setup),
    }
    b = 3 + (i % 7)
    h = 2 + (i % 5)
    source = f"Briggs §6.7, Ex. {1 + i}"
    return {
        "source": source,
        "title": "Centroid",
        "prompt": f"Find \\(\\bar{{x}}\\) for a triangle with vertices \\((0,0),({b},0),(0,{h})\\).",
        "choices": [
            {"id": "a", "latex": f"\\frac{{{b}}}{{{3}}}", "label": "Correct"},
            {"id": "b", "latex": f"\\frac{{{b}}}{{{2}}}", "label": "Used rectangle formula"},
            {"id": "c", "latex": f"\\frac{{{h}}}{{{3}}}", "label": "Confused with \\(\\bar{{y}}\\)"},
            {"id": "d", "latex": f"\\frac{{{b}}}{{{4}}}", "label": "Arithmetic error"},
        ],
        "steps": [
            {"title": "Set up moments", "body": f"\\[\\bar{{x}} = \\frac{{\\int_0^{b} x \\cdot \\frac{{h}}{{b}}({b}-x)\\,dx}}{{\\int_0^{b} \\frac{{h}}{{b}}({b}-x)\\,dx}}\\]"},
            {"title": "Evaluate", "body": f"\\[\\bar{{x}} = \\frac{{{b}}}{{{3}}}\\]"},
        ],
        "finalAnswer": f"\\bar{{x}} = \\frac{{{b}}}{{{3}}}",
        "insight": f"{source} — centroid as balance point (Briggs §6.7).",
        "visual": "centroid",
        "difficulty": ["easy", "medium", "hard"][i % 3],
        "visualParams": {"method": "centroid", "xMin": 0, "xMax": b, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": h / b, "b": 0}, "marker": {"x": b / 3, "y": h / 3}, "sampleLabel": "sample x", "measureLabel": "strip height"},
    }


def arc_problem(i):
    source = f"OpenStax Vol. 1 §6.4 / Briggs §6.5 arc-length variant {1 + i}"
    diff = ["easy", "medium", "hard"][i % 3]
    if i % 3 == 0:
        j = i // 3
        a, c, n = 1 + j % 5, j % 4, 2 + j
        L = n * sp.sqrt(1 + a**2)
        prompt = f"Find the arc length of \\(y={a}x+{c}\\) from \\(x=0\\) to \\(x={n}\\)."
        setup = f"\\[L=\\int_0^{{{n}}}\\sqrt{{1+{a}^2}}\\,dx\\]"
        top = {"t": "lin", "a": a, "b": c}
        x0, x1 = 0, n
    elif i % 3 == 1:
        j = i // 3
        k, n = 1 + j % 4, 1 + j
        L = sp.simplify(sp.Rational(2, 3 * k**2) * ((1 + k**2 * n) ** sp.Rational(3, 2) - 1))
        prompt = f"Find the arc length of \\(y=\\frac{{{2*k}}}{{3}}x^{{3/2}}\\) on \\([0,{n}]\\)."
        setup = f"Here \\(y'={k}\\sqrt{{x}}\\), so \\[L=\\int_0^{{{n}}}\\sqrt{{1+{k*k}x}}\\,dx\\]"
        top = {"t": "pow-shift", "a": 2 * k / 3, "n": 1.5, "s": 0}
        x0, x1 = 0, n
    else:
        j = i // 3
        k, s0, n = 1 + j % 4, 1 + j % 3, 2 + j
        L = sp.simplify(sp.Rational(2, 3 * k**2) * ((1 + k**2 * n) ** sp.Rational(3, 2) - 1))
        prompt = f"Find the arc length of \\(y=\\frac{{{2*k}}}{{3}}(x-{s0})^{{3/2}}\\) on \\([{s0},{s0+n}]\\)."
        setup = f"Here \\(y'={k}\\sqrt{{x-{s0}}}\\), so shift \\(u=x-{s0}\\): \\[L=\\int_0^{{{n}}}\\sqrt{{1+{k*k}u}}\\,du\\]"
        top = {"t": "pow-shift", "a": 2 * k / 3, "n": 1.5, "s": s0}
        x0, x1 = s0, s0 + n
    return {
        "source": source,
        "title": "Arc length",
        "prompt": prompt,
        "choices": [
            {"id": "a", "latex": sp.latex(L), "label": "Correct"},
            {"id": "b", "latex": sp.latex(x1 - x0), "label": "Horizontal distance only"},
            {"id": "c", "latex": sp.latex(2 * L), "label": "Doubled"},
            {"id": "d", "latex": sp.latex(sp.simplify(L / 2)), "label": "Missing part of integrand"},
        ],
        "steps": arc_strategy_steps(setup, sp.latex(L)),
        "finalAnswer": f"L = {sp.latex(L)}",
        "insight": "Arc length uses the derivative inside a square root: \\(\\int\\sqrt{1+(y')^2}\\,dx\\). Do not integrate the original function alone — that would measure area, not length.",
        "visual": "curve",
        "difficulty": diff,
        "visualParams": {"method": "arc", "xMin": x0, "xMax": x1, "bottom": {"t": "c", "v": 0}, "top": top},
        "equations": equations_kit("arc", setup),
    }
    a = 2 + (i % 4)
    b = 1 + (i % 3)
    n = 2 + (i % 4)
    source = f"Briggs §6.5, Ex. {1 + i}"
    L = sp.sqrt(1 + a**2) * n
    return {
        "source": source,
        "title": "Arc length",
        "prompt": f"Find the arc length of \\(y = {a}x + {b}\\) from \\(x = 0\\) to \\(x = {n}\\).",
        "choices": [
            {"id": "a", "latex": f"{sp.latex(L)}", "label": "Correct"},
            {"id": "b", "latex": f"{n}", "label": "Horizontal distance only"},
            {"id": "c", "latex": f"{sp.latex(sp.sqrt(a**2) * n)}", "label": "Missing +1 under root"},
            {"id": "d", "latex": f"{sp.latex(L * 2)}", "label": "Doubled"},
        ],
        "steps": [
            {"title": "Arc length formula", "body": f"\\[L = \\int_0^{n} \\sqrt{{1+{a}^2}}\\,dx\\]"},
            {"title": "Evaluate", "body": f"\\[L = {sp.latex(L)}\\]"},
        ],
        "finalAnswer": f"L = {sp.latex(L)}",
        "insight": f"{source} — arc length integral (Briggs §6.5).",
        "visual": "curve",
        "difficulty": ["easy", "medium", "hard"][i % 3],
        "visualParams": {"method": "arc", "xMin": 0, "xMax": n, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": a, "b": b}},
    }


def surface_problem(i):
    source = f"OpenStax Vol. 1 §6.4 / Briggs §6.6 surface-area variant {1 + i}"
    diff = ["easy", "medium", "hard"][i % 3]
    if i % 3 == 0:
        j = i // 3
        a, c, n = 1 + j % 4, 1 + j % 3, 2 + j
        f = a * x + c
        S = 2 * sp.pi * sp.sqrt(1 + a**2) * sp.integrate(f, (x, 0, n))
        prompt = f"Find the surface area when \\(y={expr_latex(f)}\\) on \\([0,{n}]\\) is revolved about the \\(x\\)-axis."
        setup = f"\\[S=2\\pi\\int_0^{{{n}}}({expr_latex(f)})\\sqrt{{1+{a}^2}}\\,dx\\]"
        top = {"t": "lin", "a": a, "b": c}
    elif i % 3 == 1:
        j = i // 3
        a, n = 1 + j % 4, 1 + j
        f = a * sp.sqrt(x)
        # S is left as the exact setup plus evaluated sympy expression.
        S = sp.simplify(2 * sp.pi * sp.integrate(f * sp.sqrt(1 + sp.diff(f, x) ** 2), (x, sp.Rational(1, 4), n + sp.Rational(1, 4))))
        prompt = f"Find the surface area when \\(y={expr_latex(f)}\\) on \\([1/4,{sp.latex(n + sp.Rational(1, 4))}]\\) is revolved about the \\(x\\)-axis."
        setup = f"\\[S=2\\pi\\int_{{1/4}}^{{{sp.latex(n + sp.Rational(1, 4))}}}{expr_latex(f)}\\sqrt{{1+(y')^2}}\\,dx\\]"
        top = {"t": "sqrt", "a": a}
    else:
        j = i // 3
        a, c, n = 1 + j % 4, 1 + j % 5, 2 + j
        f = c + sp.Rational(2 * a, 3) * x ** sp.Rational(3, 2)
        S = sp.simplify(2 * sp.pi * sp.integrate(f * sp.sqrt(1 + (a * sp.sqrt(x)) ** 2), (x, 0, n)))
        prompt = f"Find the surface area when \\(y={c}+\\frac{{{2*a}}}{{3}}x^{{3/2}}\\) on \\([0,{n}]\\) is revolved about the \\(x\\)-axis."
        setup = f"Since \\(y'={a}\\sqrt{{x}}\\), \\[S=2\\pi\\int_0^{{{n}}}\\left({c}+\\frac{{{2*a}}}{{3}}x^{{3/2}}\\right)\\sqrt{{1+{a*a}x}}\\,dx\\]"
        top = {"t": "pow-shift", "a": 2 * a / 3, "b": c, "n": 1.5, "s": 0}
    return {
        "source": source,
        "title": "Surface area",
        "prompt": prompt,
        "choices": [
            {"id": "a", "latex": sp.latex(S), "label": "Correct"},
            {"id": "b", "latex": sp.latex(sp.simplify(S / 2)), "label": "Missing factor of 2"},
            {"id": "c", "latex": sp.latex(sp.simplify(2 * S)), "label": "Doubled"},
            {"id": "d", "latex": sp.latex(sp.simplify(S / sp.pi)), "label": "Dropped \\(\\pi\\)"},
        ],
        "steps": surface_strategy_steps(setup, sp.latex(S)),
        "finalAnswer": f"S = {sp.latex(S)}",
        "insight": "Surface of revolution: \\(2\\pi \\times \\text{radius} \\times \\text{slant length}\\). Radius is distance to the axis; slant length is the arc element \\(ds=\\sqrt{1+(y')^2}\\,dx\\).",
        "visual": "surface",
        "difficulty": diff,
        "visualParams": {"method": "surface-x", "xMin": 0, "xMax": n + 0.25, "bottom": {"t": "c", "v": 0}, "top": top, "axisY": 0, "axisLabel": "y = 0"},
        "equations": equations_kit("surface", setup),
    }
    a = 2 + (i % 3)
    b = 1 + (i % 4)
    n = 2 + (i % 3)
    source = f"Briggs §6.6, Ex. {1 + i}"
    S = 2 * sp.pi * sp.integrate(a * x + b, (x, 0, n)) * sp.sqrt(1 + a**2)
    return {
        "source": source,
        "title": "Surface area",
        "prompt": f"Find the surface area when \\(y = {a}x + {b}\\) on \\([0,{n}]\\) is revolved about the \\(x\\)-axis.",
        "choices": [
            {"id": "a", "latex": sp.latex(S), "label": "Correct"},
            {"id": "b", "latex": sp.latex(S / 2), "label": "Missing factor of 2"},
            {"id": "c", "latex": sp.latex(2 * sp.pi * sp.integrate(a * x + b, (x, 0, n))), "label": "Missing slant factor"},
            {"id": "d", "latex": sp.latex(S * 2), "label": "Doubled"},
        ],
        "steps": [
            {"title": "Surface area formula", "body": f"\\[S = 2\\pi\\int_0^{n} ({a}x+{b})\\sqrt{{1+{a}^2}}\\,dx\\]"},
            {"title": "Evaluate", "body": f"\\[S = {sp.latex(S)}\\]"},
        ],
        "finalAnswer": f"S = {sp.latex(S)}",
        "insight": f"{source} — surface of revolution (Briggs §6.6).",
        "visual": "surface",
        "difficulty": ["easy", "medium", "hard"][i % 3],
        "visualParams": {"method": "surface-x", "xMin": 0, "xMax": n, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": a, "b": b}, "axisY": 0, "axisLabel": "y = 0"},
    }


def inertia_problem(i):
    source = f"OpenStax Vol. 1 §6.6 / Briggs §6.7 inertia variant {30 + i}"
    diff = ["easy", "medium", "hard"][i % 3]
    b = 2 + i
    h = 2 + (2 * i % 9)
    if i % 3 == 0:
        I = sp.Rational(b * h**3, 3)
        prompt = f"Find \\(I_x\\) for a rectangle with base \\({b}\\) and height \\({h}\\) about the \\(x\\)-axis."
        setup = f"\\[I_x=\\int_0^{{{b}}}\\frac{{{h}^3}}{{3}}\\,dx\\]"
        top = {"t": "c", "v": h}
    elif i % 3 == 1:
        f = h * (1 - x / b)
        I = sp.integrate(f**3 / 3, (x, 0, b))
        prompt = f"Find \\(I_x\\) for the triangular region under \\(y={h}\\left(1-\\frac{{x}}{{{b}}}\\right)\\) on \\([0,{b}]\\)."
        setup = "\\[I_x=\\int_a^b \\frac{f(x)^3}{3}\\,dx\\]"
        top = {"t": "lin", "a": -h / b, "b": h}
    else:
        f = h * (1 - (x / b) ** 2)
        I = sp.integrate(f**3 / 3, (x, 0, b))
        prompt = f"Find \\(I_x\\) for the region under \\(y={h}\\left(1-\\frac{{x^2}}{{{b*b}}}\\right)\\) on \\([0,{b}]\\)."
        setup = "\\[I_x=\\int_a^b \\frac{f(x)^3}{3}\\,dx\\]"
        top = {"t": "poly", "k": [h, 0, -h / (b * b)]}
    return {
        "source": source,
        "title": "Moment of inertia",
        "prompt": prompt,
        "choices": [
            {"id": "a", "latex": frac_latex(sp.simplify(I)), "label": "Correct"},
            {"id": "b", "latex": f"{b * h}", "label": "Used area"},
            {"id": "c", "latex": f"\\frac{{{b * h**2}}}{{2}}", "label": "Used first moment"},
            {"id": "d", "latex": frac_latex(sp.simplify(I / 2)), "label": "Missing half of region"},
        ],
        "steps": inertia_strategy_steps(setup, frac_latex(sp.simplify(I))),
        "finalAnswer": f"I_x = {frac_latex(sp.simplify(I))}",
        "insight": "Second moment of area: distance is squared, so height enters as a higher power (often \\(h^3\\)). Pieces far from the axis dominate.",
        "visual": "inertia",
        "difficulty": diff,
        "visualParams": {"method": "area", "xMin": 0, "xMax": b, "bottom": {"t": "c", "v": 0}, "top": top},
        "equations": equations_kit("inertia", setup),
    }
    b = 2 + (i % 6)
    h = 2 + (i % 5)
    source = f"Briggs §6.7, Ex. {30 + i}"
    I = sp.Rational(b * h**3, 3)
    return {
        "source": source,
        "title": "Moment of inertia",
        "prompt": f"Find \\(I_x\\) for a rectangle with base \\({b}\\) and height \\({h}\\) about the \\(x\\)-axis.",
        "choices": [
            {"id": "a", "latex": frac_latex(I), "label": "Correct"},
            {"id": "b", "latex": f"{b * h}", "label": "Used area"},
            {"id": "c", "latex": f"\\frac{{{b * h**2}}}{{2}}", "label": "First moment"},
            {"id": "d", "latex": f"\\frac{{{h * b**3}}}{{3}}", "label": "About \\(y\\)-axis"},
        ],
        "steps": [
            {"title": "Set up", "body": f"\\[I_x = \\int_0^{b} \\frac{{{h}^3}}{{3}}\\,dx\\]"},
            {"title": "Evaluate", "body": f"\\[I_x = \\frac{{{b} \\cdot {h}^3}}{{3}} = {frac_latex(I)}\\]"},
        ],
        "finalAnswer": f"I_x = {frac_latex(I)}",
        "insight": f"{source} — second moment of area (Briggs §6.7).",
        "visual": "inertia",
        "difficulty": ["easy", "medium", "hard"][i % 3],
        "visualParams": {"method": "area", "xMin": 0, "xMax": b, "bottom": {"t": "c", "v": 0}, "top": {"t": "c", "v": h}},
    }


def application_problem(i):
    source = f"OpenStax Vol. 1 §6.5 / Briggs applications variant {1 + i}"
    diff = ["easy", "medium", "hard"][i % 3]
    if i % 3 == 0:
        k = 50 + 5 * i
        stretch = sp.Rational(1, 4) + sp.Rational(i, 100)
        W = sp.Rational(1, 2) * k * stretch**2
        prompt = f"A spring with \\(k={k}\\) N/m is stretched \\({sp.latex(stretch)}\\) m from equilibrium. Find the work."
        setup = f"Hooke's law: \\(F(x)={k}x\\). Work is force integrated over the stretch: \\[W=\\int_0^{{{sp.latex(stretch)}}}{k}x\\,dx\\]"
        kind = "spring"
        choices = [
            {"id": "a", "latex": frac_latex(W), "label": "Correct"},
            {"id": "b", "latex": frac_latex(k * stretch), "label": "Force times distance"},
            {"id": "c", "latex": frac_latex(W / 2), "label": "Extra half"},
            {"id": "d", "latex": frac_latex(k * stretch**2), "label": "Forgot \\(1/2\\)"},
        ]
        vp = {"method": "area", "xMin": 0, "xMax": float(stretch), "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": k}}
    elif i % 3 == 1:
        depth, width, density = 2 + i // 3, 3 + i % 7, 9800
        W = sp.Rational(density * width * depth**2, 2)
        prompt = f"A rectangular tank is \\({width}\\) m wide and filled to depth \\({depth}\\) m. Find the work to pump the water to the top edge."
        setup = f"With \\(y\\) measured from the bottom, a thin slab at height \\(y\\) is lifted \\({depth}-y\\) meters: \\[W={density}\\int_0^{{{depth}}}{width}({depth}-y)\\,dy\\]"
        kind = "pump"
        choices = [
            {"id": "a", "latex": frac_latex(W), "label": "Correct"},
            {"id": "b", "latex": frac_latex(density * width * depth), "label": "Used weight only"},
            {"id": "c", "latex": frac_latex(2 * W), "label": "Doubled distance"},
            {"id": "d", "latex": frac_latex(W / density), "label": "Dropped density"},
        ]
        vp = {"method": "area", "xMin": 0, "xMax": depth, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": -width, "b": width * depth}}
    else:
        F0, slope, d = 20 + 3 * i, 3 + i % 7, 4 + i // 3
        W = sp.integrate(F0 + slope * x, (x, 0, d))
        prompt = f"A variable force \\(F(x)={F0}+{slope}x\\) N moves an object from \\(x=0\\) to \\(x={d}\\) m. Find the work."
        setup = f"When force varies with position, \\[W=\\int_a^b F(x)\\,dx=\\int_0^{{{d}}}({F0}+{slope}x)\\,dx\\]"
        kind = "generic"
        choices = [
            {"id": "a", "latex": frac_latex(W), "label": "Correct"},
            {"id": "b", "latex": frac_latex(F0 * d), "label": "Ignored variable part"},
            {"id": "c", "latex": frac_latex(slope * d**2), "label": "Forgot constant force"},
            {"id": "d", "latex": frac_latex(2 * W), "label": "Doubled"},
        ]
        vp = {"method": "area", "xMin": 0, "xMax": d, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": slope, "b": F0}}
    return {
        "source": source,
        "title": "Work",
        "prompt": prompt,
        "choices": choices,
        "steps": work_strategy_steps(setup, f"{frac_latex(W)}\\text{{ J}}", kind),
        "finalAnswer": f"W = {frac_latex(W)}\\text{{ J}}",
        "insight": "Variable force or different travel distances → integrate. Constant force × distance only works when force and path are constant for every piece.",
        "visual": "area",
        "difficulty": diff,
        "visualParams": vp,
        "equations": equations_kit("pump" if kind == "pump" else "work", setup),
    }
    k = 50 + 10 * (i % 10)
    stretch = sp.Rational(1, 4) + sp.Rational(i % 5, 20)
    W = sp.Rational(1, 2) * k * stretch**2
    source = f"Briggs §6.7, Ex. {1 + i}" if i < 20 else f"OpenStax Vol. 1 §6.5, Ex. {1 + i - 20}"
    return {
        "source": source,
        "title": "Work",
        "prompt": f"A spring with \\(k={k}\\) N/m is stretched \\({sp.latex(stretch)}\\) m from equilibrium. Find the work (J).",
        "choices": [
            {"id": "a", "latex": frac_latex(W), "label": "Correct"},
            {"id": "b", "latex": frac_latex(k * stretch), "label": "Force times distance"},
            {"id": "c", "latex": frac_latex(W / 2), "label": "Missing factor"},
            {"id": "d", "latex": frac_latex(k * stretch**2), "label": "Forgot 1/2"},
        ],
        "steps": [
            {"title": "Hooke's law", "body": f"\\[F(x) = {k}x,\\quad W = \\int_0^{{{sp.latex(stretch)}}} {k}x\\,dx\\]"},
            {"title": "Evaluate", "body": f"\\[W = {frac_latex(W)}\\text{{ J}}\\]"},
        ],
        "finalAnswer": f"W = {frac_latex(W)}\\text{{ J}}",
        "insight": f"{source} — work as integral of force (Briggs §6.7 / OpenStax Vol. 1 §6.5).",
        "visual": "area",
        "difficulty": ["easy", "medium", "hard"][i % 3],
        "visualParams": {"method": "area", "xMin": 0, "xMax": float(stretch), "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": k}},
    }


# Choice cards clutter when latex is long; full form still lives in finalAnswer/steps.
LONG_CHOICE_CHARS = 52
CHOICE_EXACT_CHARS = 34


def split_labeled_answer(answer: str) -> tuple[str, str]:
    """Split 'L = <expr>' into ('L = ', '<expr>'). Prefix may be empty.

    Must ignore '=' inside braces (e.g. I_{y=-1} = 86) — only split on a
    top-level equals sign.
    """
    s = str(answer).strip()
    depth = 0
    split_at = None
    for i, ch in enumerate(s):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth = max(0, depth - 1)
        elif ch == "=" and depth == 0:
            split_at = i
    if split_at is None:
        return "", s
    left = s[:split_at].rstrip()
    right = s[split_at + 1 :].lstrip()
    if not left or not right:
        return "", s
    # Require a label-like left side (starts with letter, backslash, or '(')
    if not re.match(r"^[A-Za-z\\(\\bar]", left):
        return "", s
    return left + " = ", right


_COMPACT_FN = (
    r"ln|log|sin|cos|tan|cot|sec|csc|"
    r"arcsin|arccos|arctan|arccot|arcsec|arccsc|"
    r"sinh|cosh|tanh|exp|det|max|min"
)


def latex_braces_balanced(s: str) -> bool:
    """True when { } depth never goes negative and ends at 0."""
    depth = 0
    for ch in s:
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth < 0:
                return False
    return depth == 0


def latex_fracs_complete(s: str) -> bool:
    """Every \\frac must be followed by two brace-groups (num and den)."""
    i = 0
    while True:
        j = s.find("\\frac", i)
        if j < 0:
            return True
        # skip \frac if it is a longer command name (shouldn't happen)
        k = j + 5
        # optional * (displaystyle variants rare; ignore)
        while k < len(s) and s[k].isspace():
            k += 1
        for _ in range(2):
            if k >= len(s) or s[k] != "{":
                return False
            depth = 0
            while k < len(s):
                if s[k] == "{":
                    depth += 1
                elif s[k] == "}":
                    depth -= 1
                    if depth == 0:
                        k += 1
                        break
                k += 1
            else:
                return False
            while k < len(s) and s[k].isspace():
                k += 1
        i = k


def compact_math_latex(latex: str) -> str:
    """Shorter display latex for MC cards (solution keeps the full sympy form).

    Never re-introduce hyperbolic names. Do not strip braces that close \\frac.

    Critical: only rewrite complete ``\\fn{(arg)}`` pairs atomically. A two-step
    open-then-close rewrite previously ate the closing brace of ``\\frac``
    numerators/denominators, producing KaTeX-red raw strings like
    ``\\frac{\\ln(2){2}`` instead of ``\\frac{\\ln(2)}{2}``.
    """
    s = str(latex).strip()
    # Drop size matchers that bloat KaTeX width.
    s = s.replace("\\left", "").replace("\\right", "")
    # Prefer ln in calc context; sympy emits \log.
    s = re.sub(r"\\log(?![a-zA-Z])", r"\\ln", s)
    # Atomic only: \fn{(simple arg with no nested parens)} → \fn(arg)
    # Nested cases keep the sympy ``{(...)}`` form, which KaTeX renders fine.
    s = re.sub(
        r"(\\(?:" + _COMPACT_FN + r"))\{\(\s*([^()]*?)\s*\)\}",
        r"\1(\2)",
        s,
    )
    # Collapse spaces around braces a bit (safe).
    s = re.sub(r"\{\s+", "{", s)
    s = re.sub(r"\s+\}", "}", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def latex_positive_first(expr) -> str:
    """Render a sum with positive terms first so choice cards are easier to scan."""
    try:
        expr = sp.simplify(expr)
        if not isinstance(expr, sp.Add):
            return compact_math_latex(sp.latex(expr))
        pos, neg = [], []
        for term in sp.Add.make_args(expr):
            if term.could_extract_minus_sign():
                neg.append(-term)
            else:
                pos.append(term)
        if not pos and not neg:
            return "0"
        chunks: list[str] = []
        for i, term in enumerate(pos):
            lx = compact_math_latex(sp.latex(term))
            chunks.append(lx if i == 0 else f"+ {lx}")
        start_neg = not chunks
        for i, term in enumerate(neg):
            lx = compact_math_latex(sp.latex(term))
            if start_neg and i == 0:
                chunks.append(f"-{lx}")
            else:
                chunks.append(f"- {lx}")
        return " ".join(chunks)
    except Exception:
        return compact_math_latex(sp.latex(expr))


def choice_value_latex(value, *, exact_limit: int = CHOICE_EXACT_CHARS) -> str:
    """Render a choice value compactly while keeping short exact answers exact.

    The solution retains the full symbolic form.  Cards are a recognition task,
    though, so nested logarithms/radicals and long pi-products become a readable
    decimal instead of forcing the learner to parse a wall of algebra.
    """
    try:
        # Values passed here have already been evaluated by _compute_value.
        # Avoid another global simplify: long symbolic surface/arc answers make
        # that quadratic in bank-build time.
        if len(str(value)) > exact_limit * 2:
            numeric = sp.N(value, 8)
            if getattr(numeric, "is_real", False):
                number = float(numeric)
                if abs(number) < 1e-6:
                    return "0"
                if abs(number - round(number)) < 1e-9:
                    return str(int(round(number)))
                return f"{number:.5g}"
        exact = compact_math_latex(sp.latex(value))
        if len(exact) <= exact_limit:
            return exact
        numeric = sp.N(value, 8)
        if getattr(numeric, "is_real", False):
            number = float(numeric)
            if abs(number) < 1e-6:
                return "0"
            if abs(number - round(number)) < 1e-9:
                return str(int(round(number)))
            return f"{number:.5g}"
    except Exception:
        pass
    return compact_math_latex(sp.latex(value))


def format_choice_latex(answer: str, body: str | None = None) -> str:
    """Choice text: drop long 'L =' prefixes; always compact the body."""
    prefix, rhs = split_labeled_answer(answer)
    body = compact_math_latex(body if body is not None else rhs)
    # Keep a short label only when the whole card stays compact.
    if prefix and len(body) < LONG_CHOICE_CHARS:
        return compact_math_latex(prefix + body)
    return body


def _choice_key(s: str) -> str:
    """Normalize for uniqueness: ignore spaces and a leading 'Label =' prefix."""
    s = str(s).replace(" ", "")
    # Drop one top-level "X=" / "X_{...}=" label so "S=expr" ≡ "expr"
    m = re.match(r"^[A-Za-z\\]+(?:_\{[^}]+\})?=", s)
    if m:
        s = s[m.end() :]
    return s


def _choice_unique(candidates: list[str], correct: str) -> list[str]:
    """Return up to 3 wrong latex strings, distinct from correct and each other."""
    out: list[str] = []
    seen = {_choice_key(correct)}
    for c in candidates:
        key = _choice_key(c)
        if not c or key in seen:
            continue
        seen.add(key)
        out.append(c)
        if len(out) >= 3:
            break
    return out


def _compute_value(compute: dict):
    """Reuse compute['value'] when present to avoid re-integrating during MC build."""
    if compute.get("value") is not None:
        return sp.simplify(compute["value"])
    var = compute.get("var", x)
    expr = compute["expr"]
    a, b = compute["a"], compute["b"]
    scale = compute.get("scale", 1)
    return sp.simplify(scale * sp.integrate(expr, (var, a, b)))


def short_distractors_from_compute(compute: dict | None) -> list[str]:
    """Build short conceptual wrongs when the exact closed form is too long to wrap."""
    if not compute:
        return []
    try:
        var = compute.get("var", x)
        expr = compute["expr"]
        a, b = compute["a"], compute["b"]
        scale = compute.get("scale", 1)
        F = real_antiderivative(expr, var)
        Fa = eval_antideriv_at(F, var, a, side="+")
        Fb = eval_antideriv_at(F, var, b, side="-")
        upper_only = sp.simplify(scale * Fb)
        lower_only = sp.simplify(scale * Fa)
        swapped = sp.simplify(scale * (Fa - Fb))
        span = sp.simplify(b - a)
        val = _compute_value(compute)
        doubled = sp.simplify(2 * val)
        half = sp.simplify(val / 2)
        scored: list[tuple[int, str]] = []
        for term in (span, upper_only, lower_only, half, doubled, swapped):
            if is_bad_sympy_value(term):
                continue
            lx = choice_value_latex(term)
            if "NaN" in lx or "nan" in lx.lower():
                continue
            # Prefer genuinely short distractors for the card grid.
            if lx and len(lx) <= LONG_CHOICE_CHARS + 24:
                scored.append((len(lx), lx))
        # Shortest first so long "swapped bounds" clones don't crowd out e−1 style slips.
        scored.sort(key=lambda t: t[0])
        return [lx for _, lx in scored]
    except Exception:
        return []


def choice_body_from_compute(compute: dict | None) -> str | None:
    """Prefer a compact sympy-evaluated RHS for the correct choice when available."""
    if not compute:
        return None
    try:
        body = choice_value_latex(_compute_value(compute))
        return body or None
    except Exception:
        return None


def auto_mc_choices(answer: str, compute: dict | None = None) -> list[dict]:
    """
    Build four MC choices that stay readable on the card grid.

    - Algebraic 2× / ÷2 wraps the RHS only (never '2(L = …)').
    - Long closed forms omit the 'L =' prefix on cards; full form stays in finalAnswer/steps.
    - When the exact value is long, prefer short conceptual distractors over 2× wrapping.
    """
    prefix, rhs = split_labeled_answer(answer)
    body = choice_body_from_compute(compute) or compact_math_latex(rhs)
    correct = format_choice_latex(answer, body)
    # Nested \frac{\frac{a}{b}}{2} is hard to read on cards — treat frac-heavy
    # bodies like long answers and prefer short conceptual distractors.
    frac_heavy = body.count("\\frac") >= 1 and len(body) >= 18
    long = len(body) >= LONG_CHOICE_CHARS or frac_heavy

    candidates: list[str] = []
    if long:
        # Prefer short conceptual wrongs — never 2×-wrap a novel-length closed form.
        candidates.extend(short_distractors_from_compute(compute))
        candidates.extend([
            "2",
            "1",
            "e-1" if ("e" in body or "\\ln" in body or "\\log" in body) else "\\pi",
            "\\sqrt{2}",
        ])
    else:
        # Prefer sympy half when compute is available (clean \frac{25}{4} not nested).
        half_body = None
        if compute is not None:
            try:
                half_body = choice_value_latex(sp.simplify(_compute_value(compute) / 2))
            except Exception:
                half_body = None
        if not half_body:
            half_body = (
                f"\\frac{{1}}{{2}}\\left({body}\\right)"
                if "\\frac" in body
                else f"\\frac{{{body}}}{{2}}"
            )
        if compute is not None:
            try:
                twice_body = choice_value_latex(2 * _compute_value(compute))
            except Exception:
                twice_body = f"2\\left({body}\\right)"
        else:
            twice_body = f"2\\left({body}\\right)"
        candidates = [
            format_choice_latex(answer, twice_body),
            format_choice_latex(answer, half_body),
        ]
        # Prefer a distinct third: drop a π factor cleanly (never leave "2 1" or "frac").
        if "\\pi" in body:
            stripped = body
            stripped = re.sub(r"\\cdot\s*\\pi", "", stripped)
            stripped = re.sub(r"\\pi\s*\\cdot\s*", "", stripped)
            stripped = re.sub(r"\\pi", "", stripped)
            stripped = re.sub(r"\s{2,}", " ", stripped)
            stripped = re.sub(r"\(\s*\)", "", stripped)
            # Clean empty braces / stray ops — do NOT use str.strip("\\...") which eats backslashes.
            stripped = re.sub(r"\{\s*\}", "", stripped)
            stripped = re.sub(r"\{\s+", "{", stripped)
            stripped = re.sub(r"\s+\}", "}", stripped)
            stripped = re.sub(r"^\s*[+·]\s*", "", stripped)
            stripped = re.sub(r"\s*[+·]\s*$", "", stripped)
            stripped = stripped.strip()
            # Reject debris like "V = \frac{4}" (denom was only \pi) or "2 1".
            if (
                stripped
                and stripped not in ("", body, correct)
                and "NaN" not in stripped
                and latex_braces_balanced(stripped)
                and latex_fracs_complete(stripped)
                and not re.search(r"\b\d\s+\d\b", stripped)
            ):
                candidates.append(format_choice_latex(answer, stripped))
        elif prefix and body != correct:
            candidates.append(body)
        candidates.append(format_choice_latex(answer, f"-\\left({body}\\right)"))
        candidates.append("0")

    wrongs = _choice_unique(candidates, correct)
    # Pad if uniqueness filtered too hard.
    for pad in ("0", "1", "2", "\\pi", "e-1", "\\sqrt{2}"):
        if len(wrongs) >= 3:
            break
        if pad.replace(" ", "") != correct.replace(" ", "") and pad not in wrongs:
            wrongs.append(pad)

    while len(wrongs) < 3:
        wrongs.append(f"{len(wrongs)+1}")

    return mc_choices(correct, wrongs[0], wrongs[1], wrongs[2])


def mc_choices(answer, wrong1, wrong2, wrong3):
    return [
        {"id": "a", "latex": answer, "label": "Correct"},
        {"id": "b", "latex": wrong1, "label": "Common setup error"},
        {"id": "c", "latex": wrong2, "label": "Missing factor or bound"},
        {"id": "d", "latex": wrong3, "label": "Arithmetic/axis slip"},
    ]


def double_latex(body: str) -> str:
    """Readable 2× distractor (no label wrap)."""
    body = compact_math_latex(body)
    return f"2\\left({body}\\right)"


def half_latex(body: str) -> str:
    """Readable ½ distractor — never nest as \\frac{\\frac{a}{b}}{2}."""
    body = compact_math_latex(body)
    if "\\frac" in body:
        return f"\\frac{{1}}{{2}}\\left({body}\\right)"
    return f"\\frac{{{body}}}{{2}}"


def half_value_latex(val) -> str:
    """Half of a sympy value as clean latex (preferred when available)."""
    try:
        return nice_latex(sp.simplify(val / 2))
    except Exception:
        return half_latex(nice_latex(val))


def expand_custom_steps(setup, answer, visual, visual_params=None, prompt="", compute=None):
    """Full multi-step solutions; use compute={expr,a,b,scale,label,var,...} for no-shortcut algebra."""
    vp = visual_params or {}
    method = vp.get("method", "")
    text = f"{setup} {prompt}".lower()

    if visual == "volume" or method.startswith(("disk", "washer", "shell", "cross")):
        return volume_strategy_steps(method, setup, answer, compute, prompt=prompt)
    if visual == "curve" or method == "arc":
        return arc_strategy_steps(setup, answer, compute)
    if visual == "surface" or method.startswith("surface"):
        return surface_strategy_steps(setup, answer, compute)
    if visual == "centroid":
        return centroid_strategy_steps(setup, answer, compute)
    if visual == "inertia":
        return inertia_strategy_steps(setup, answer, compute)
    if visual == "area" and ("work" in text or "force" in text or "pump" in text or "spring" in text
                             or "velocity" in text or "rope" in text or "energy" in text
                             or "profit" in text or "flow" in text or "drug" in text or "power" in text):
        if "spring" in text or "hooke" in text:
            kind = "spring"
        elif "pump" in text or "tank" in text or "water" in text:
            kind = "pump"
        elif "rope" in text or "chain" in text:
            kind = "rope"
        elif "velocity" in text or "distance" in text:
            kind = "kinematics"
        else:
            kind = "generic"
        return work_strategy_steps(setup, answer, kind, compute)
    if visual == "area":
        return area_strategy_steps(setup, answer, compute)
    if compute:
        return full_definite_eval_steps(
            compute["expr"], compute["a"], compute["b"], compute.get("var", x),
            label=compute.get("label", "I"), scale=compute.get("scale", 1),
            units=compute.get("units"),
        )
    return [
        step("Strategy: translate the problem into an integral", "Identify what is accumulating (area, volume, work, length, …) and what the thin slice looks like."),
        step("Write the integral", _as_math(setup)),
        step("Find an antiderivative", "Integrate term by term — show every power-rule or table step."),
        step("Apply bounds and simplify", f"Evaluate upper − lower, then simplify fully: \\[{display_answer(answer)}\\]"),
    ]


def custom_problem(source, title, prompt, answer, setup, visual, difficulty, visual_params, insight, compute=None):
    method = (visual_params or {}).get("method")
    kind = equations_kind_from_method(method, visual, prompt)
    return {
        "source": source,
        "title": title,
        "prompt": prompt,
        # Compact choice labels; full closed form remains in finalAnswer + solution steps.
        "choices": auto_mc_choices(answer, compute),
        "steps": expand_custom_steps(setup, answer, visual, visual_params, prompt, compute),
        "finalAnswer": answer,
        "insight": insight,
        "visual": visual,
        "difficulty": difficulty,
        "visualParams": visual_params,
        "equations": equations_kit(kind, setup),
    }


def catalog_area_varied():
    """12 distinct area concepts (incl. horizontal strips); 20 easy / 20 medium / 10 hard."""
    out = []
    N_AREA = 14
    for i in range(PER_TOPIC):
        case = i % N_AREA
        diff = difficulty_for_index(i)
        tier = difficulty_tier(diff)
        rep = (i // N_AREA) % 2
        source = f"OpenStax Vol. 1 §5.2 / Briggs §5.3 area concept {case + 1}, item {i + 1}"
        compute = None
        if case == 0:
            # Area under a polynomial (degree ≥ 2)
            bnd = 2 + tier + rep
            if tier == 0:
                f = (1 + rep) * x**2 + 1
                top = {"t": "poly", "k": [1, 0, 1 + rep]}
            elif tier == 1:
                f = x**3 - (1 + rep) * x + 2
                # shift if needed so positive on [0,bnd] — use x^2 + x + 1 style instead for safety
                f = (2 + rep) * x**2 + (1 + rep) * x + 1
                top = {"t": "poly", "k": [1 + rep, 1 + rep, 2 + rep]}
            else:
                f = x**3 + (2 + rep) * x**2 + 1
                top = {"t": "poly", "k": [1, 0, 2 + rep, 1]}
            val = sp.integrate(f, (x, 0, bnd))
            prompt = f"Find the area under \\(y={expr_latex(f)}\\) on \\([0,{bnd}]\\)."
            setup = f"\\[A=\\int_0^{{{bnd}}}({expr_latex(f)})\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": bnd, "bottom": {"t": "c", "v": 0}, "top": top}
            compute = {
                "expr": f, "a": 0, "b": bnd, "label": "A",
                "parts": {"top": expr_latex(f), "bottom": "0", "height": expr_latex(f), "var": "x"},
            }
        elif case == 1:
            # Area under a downward parabola arch (fully above axis on the interval)
            bnd = 2 + tier
            h = bnd * bnd + 2 + tier + rep
            f = h - x**2
            val = sp.integrate(f, (x, 0, bnd))
            prompt = f"Find the area between \\(y={h}-x^2\\) and the \\(x\\)-axis on \\([0,{bnd}]\\)."
            setup = f"\\[A=\\int_0^{{{bnd}}}({h}-x^2)\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": bnd, "bottom": {"t": "c", "v": 0}, "top": {"t": "poly", "k": [h, 0, -1]}}
            compute = {
                "expr": f, "a": 0, "b": bnd, "label": "A",
                "parts": {"top": f"{h}-x^2", "bottom": "0", "height": f"{h}-x^2", "var": "x"},
            }
        elif case == 2:
            # Area between a line and a parabola (intersections given / easy to check)
            c = 2 + tier + rep
            top = c * x - x**2
            bot = x
            # intersections at 0 and c-1 (require c>1)
            hi = c - 1
            val = sp.integrate(top - bot, (x, 0, hi))
            prompt = f"Find the enclosed area between \\(y={expr_latex(top)}\\) and \\(y=x\\) from their intersections at \\(x=0\\) and \\(x={hi}\\)."
            setup = f"\\[A=\\int_0^{{{hi}}}[({expr_latex(top)})-x]\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": float(hi), "bottom": {"t": "lin", "a": 1}, "top": {"t": "poly", "k": [0, c, -1]}}
            compute = {
                "expr": top - bot, "a": 0, "b": hi, "label": "A",
                "parts": {
                    "top": expr_latex(top), "bottom": "x",
                    "height": f"({expr_latex(top)})-x", "var": "x",
                },
            }
        elif case == 3:
            # Enclosed region y=x^2 and y=mx
            m = 2 + tier + rep
            top = m * x
            bot = x**2
            hi = m
            val = sp.integrate(top - bot, (x, 0, hi))
            prompt = f"Find the area enclosed by \\(y={m}x\\) and \\(y=x^2\\)."
            setup = f"Intersections at \\(x=0,{m}\\): \\[A=\\int_0^{{{m}}}({m}x-x^2)\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": m, "bottom": {"t": "pow", "a": 1, "n": 2}, "top": {"t": "lin", "a": m}}
            compute = {
                "expr": top - bot, "a": 0, "b": hi, "label": "A",
                "parts": {"top": f"{m}x", "bottom": "x^2", "height": f"{m}x-x^2", "var": "x"},
            }
        elif case == 4:
            # Symmetric total area under even arch
            h = 3 + tier + rep
            val = 2 * sp.integrate(h - x**2, (x, 0, sp.sqrt(h)))
            prompt = f"Find the total area enclosed by \\(y={h}-x^2\\) and the \\(x\\)-axis."
            setup = f"\\[A=2\\int_0^{{\\sqrt{{{h}}}}}({h}-x^2)\\,dx\\]"
            vp = {"method": "area", "xMin": -float(sp.sqrt(h)), "xMax": float(sp.sqrt(h)), "bottom": {"t": "c", "v": 0}, "top": {"t": "poly", "k": [h, 0, -1]}}
            compute = {
                "expr": h - x**2, "a": 0, "b": sp.sqrt(h), "label": "A", "scale": 2,
                "parts": {"top": f"{h}-x^2", "bottom": "0", "height": f"{h}-x^2", "var": "x"},
            }
        elif case == 5:
            # Area with sine
            c = 2 + tier + rep
            if tier < 2:
                f = c + sp.sin(x)
                val = sp.integrate(f, (x, 0, sp.pi))
                prompt = f"Find the area under \\(y={c}+\\sin x\\) on \\([0,\\pi]\\)."
                setup = f"\\[A=\\int_0^\\pi({c}+\\sin x)\\,dx\\]"
                vp = {"method": "area", "xMin": 0, "xMax": 3.14159, "bottom": {"t": "c", "v": 0}, "top": {"t": "sin", "a": 1, "b": c}}
                compute = {
                    "expr": f, "a": 0, "b": sp.pi, "label": "A",
                    "parts": {"top": expr_latex(f), "bottom": "0", "height": expr_latex(f), "var": "x"},
                }
            else:
                f = sp.sin(x) ** 2
                val = sp.integrate(f, (x, 0, sp.pi))
                prompt = f"Find the area under \\(y=\\sin^2 x\\) on \\([0,\\pi]\\)."
                setup = f"Use \\(\\sin^2 x=\\frac{{1-\\cos 2x}}{{2}}\\): \\[A=\\int_0^\\pi\\sin^2 x\\,dx\\]"
                vp = {"method": "area", "xMin": 0, "xMax": 3.14159, "bottom": {"t": "c", "v": 0}, "top": {"t": "sin", "a": 1, "b": 0}}
                compute = {
                    "expr": f, "a": 0, "b": sp.pi, "label": "A",
                    "parts": {"top": "\\sin^2 x", "bottom": "0", "height": "\\sin^2 x", "var": "x"},
                }
        elif case == 6:
            # Area between parabola and line on a fixed interval
            k = 1 + tier + rep
            top = x**2 + k
            bot = x
            hi = 2 + tier
            val = sp.integrate(top - bot, (x, 0, hi))
            prompt = f"Find the area between \\(y={expr_latex(top)}\\) and \\(y=x\\) on \\([0,{hi}]\\)."
            setup = f"\\[A=\\int_0^{{{hi}}}[({expr_latex(top)})-x]\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": hi, "bottom": {"t": "lin", "a": 1}, "top": {"t": "poly", "k": [k, 0, 1]}}
            compute = {
                "expr": top - bot, "a": 0, "b": hi, "label": "A",
                "parts": {
                    "top": expr_latex(top), "bottom": "x",
                    "height": f"({expr_latex(top)})-x", "var": "x",
                },
            }
        elif case == 7:
            # Area under square root / root powers
            a = 1 + tier + rep
            bnd = 4 + tier
            if tier < 2:
                f = a * sp.sqrt(x)
                top = {"t": "sqrt", "a": a}
            else:
                f = a * x ** sp.Rational(1, 3)
                top = {"t": "pow", "a": a, "n": sp.Rational(1, 3)}
            val = sp.integrate(f, (x, 0, bnd))
            prompt = f"Find the area under \\(y={expr_latex(f)}\\) on \\([0,{bnd}]\\)."
            setup = f"\\[A=\\int_0^{{{bnd}}}{expr_latex(f)}\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": bnd, "bottom": {"t": "c", "v": 0}, "top": top}
            compute = {
                "expr": f, "a": 0, "b": bnd, "label": "A",
                "parts": {"top": expr_latex(f), "bottom": "0", "height": expr_latex(f), "var": "x"},
            }
        elif case == 8:
            # Area under reciprocal / rational
            if tier == 0:
                lo, hi = 1, 2 + rep
                f = 1 / x
            elif tier == 1:
                lo, hi = 1, 3 + rep
                f = (2 + rep) / x
            else:
                lo, hi = 1, 2 + rep
                f = (x + 1) / x  # 1 + 1/x
            val = sp.integrate(f, (x, lo, hi))
            prompt = f"Find the area under \\(y={expr_latex(f)}\\) on \\([{lo},{hi}]\\)."
            setup = f"\\[A=\\int_{{{lo}}}^{{{hi}}}{expr_latex(f)}\\,dx\\]"
            vp = {"method": "area", "xMin": lo, "xMax": hi, "bottom": {"t": "c", "v": 0}, "top": {"t": "recip", "a": 1}}
            compute = {
                "expr": f, "a": lo, "b": hi, "label": "A",
                "parts": {"top": expr_latex(f), "bottom": "0", "height": expr_latex(f), "var": "x"},
            }
        elif case == 9:
            # Piecewise lower boundary (vertical strips)
            k = 3 + tier + rep
            top_y = 5 + tier + rep
            mid = 1 + tier
            val = sp.integrate(top_y - x, (x, 0, mid)) + sp.integrate(top_y - mid, (x, mid, k))
            prompt = (
                f"Find the area enclosed by \\(y={top_y}\\), \\(y=x\\), and \\(y={mid}\\), "
                f"with vertical sides \\(x=0\\) and \\(x={k}\\)."
            )
            setup = (
                f"Split where the lower boundary changes: "
                f"\\[A=\\int_0^{{{mid}}}({top_y}-x)dx+\\int_{{{mid}}}^{{{k}}}({top_y}-{mid})dx\\]"
            )
            vp = {
                "method": "area",
                "xMin": 0,
                "xMax": k,
                "bottom": {
                    "t": "piecewise",
                    "segments": [
                        {"min": 0, "max": mid, "curve": {"t": "lin", "a": 1}},
                        {"min": mid, "max": k, "curve": {"t": "c", "v": mid}},
                    ],
                },
                "top": {"t": "c", "v": top_y},
            }
            piece1 = full_definite_eval_steps(top_y - x, 0, mid, x, label="A_1", scale=1)
            piece2 = full_definite_eval_steps(sp.Integer(top_y - mid), mid, k, x, label="A_2", scale=1)
            steps = [
                step("Strategy: split the region", "The lower boundary changes at a corner — write two integrals and evaluate each fully."),
                step("Piece 1 setup", f"From \\(x=0\\) to \\(x={mid}\\), height is \\({top_y}-x\\)."),
            ] + piece1 + [
                step("Piece 2 setup", f"From \\(x={mid}\\) to \\(x={k}\\), height is the constant \\({top_y - mid}\\)."),
            ] + piece2 + [
                step("Add the two pieces", f"\\[A=A_1+A_2={nice_latex(sp.simplify(val))}\\]"),
            ]
            val_s = sp.simplify(val)
            ans = f"A = {nice_latex(val_s)}"
            out.append({
                "source": source, "title": "Area", "prompt": prompt,
                "choices": mc_choices(
                    ans,
                    double_latex(nice_latex(val_s)),
                    half_value_latex(val_s),
                    nice_latex(sp.simplify(val_s + 1)),
                ),
                "steps": steps, "finalAnswer": ans,
                "insight": "Area is accumulated height × width. Between two curves use (top − bottom); split the integral if the top or bottom formula changes.",
                "visual": "area", "difficulty": diff, "visualParams": vp,
                "equations": equations_kit("area", setup),
            })
            continue
        elif case == 10:
            # Horizontal strips: region between x = y^2 and x = c
            c = 4 + tier + rep
            hi = int(sp.sqrt(c))
            # ensure hi^2 <= c; pick c as perfect square for clean bounds
            hi = 2 + tier
            c = hi * hi
            width = c - y**2
            val = sp.integrate(width, (y, 0, hi))
            prompt = (
                f"Use horizontal strips to find the area of the region bounded by "
                f"\\(x=y^2\\), \\(x={c}\\), and \\(y=0\\)."
            )
            setup = (
                f"At height \\(y\\), strip length is right − left: "
                f"\\[A=\\int_0^{{{hi}}}\\big({c}-y^2\\big)\\,dy\\]"
            )
            vp = {
                "method": "area",
                "orientation": "horizontal",
                "yMin": 0,
                "yMax": hi,
                "xMin": 0,
                "xMax": c,
                "left": {"t": "pow", "a": 1, "n": 2},  # x = y^2 shown via inverse visual when supported
                "right": {"t": "c", "v": c},
                "bottom": {"t": "c", "v": 0},
                "top": {"t": "sqrt", "a": 1},  # y = √x for vertical-fallback plot of same region
            }
            compute = {
                "expr": width, "a": 0, "b": hi, "var": y, "label": "A",
                "parts": {
                    "right": str(c), "left": "y^{2}", "width": f"{c}-y^{{2}}",
                    "height": f"{c}-y^{{2}}", "var": "y", "lo": 0, "hi": hi,
                    "orientation": "horizontal",
                },
                "display_integrand": f"{c}-y^{{2}}",
            }
        elif case == 12:
            # Signed versus geometric area: the curve crosses the axis twice.
            # This is the distinction students often miss when they treat every
            # definite integral as an ordinary (nonnegative) area.
            f = sp.sin(x) - sp.Rational(1, 2)
            p, q = sp.pi / 6, 5 * sp.pi / 6
            signed = sp.integrate(f, (x, 0, sp.pi))
            geometric = sp.simplify(
                sp.integrate(-f, (x, 0, p))
                + sp.integrate(f, (x, p, q))
                + sp.integrate(-f, (x, q, sp.pi))
            )
            prompt = (
                "Find the total geometric area between "
                "\(y=\\sin x-\\frac12\) and the \(x\)-axis on \([0,\\pi]\). "
                "The curve changes sign, so split at its zeros."
            )
            setup = (
                "Zeros occur at \(x=\\frac{\\pi}{6},\\frac{5\\pi}{6}\): "
                "\[A=\\int_0^{\\pi/6}(-f)dx+\\int_{\\pi/6}^{5\\pi/6}f\\,dx+"
                "\\int_{5\\pi/6}^{\\pi}(-f)dx\]"
            )
            steps = [
                step("Strategy: separate signed pieces", "A geometric area is always positive. Where \(f(x)<0\), use \(-f(x)\) before adding."),
                step("Find the crossings", "Solve \(\\sin x-\\frac12=0\) on \([0,\\pi]\): \(x=\\frac{\\pi}{6},\\frac{5\\pi}{6}\)."),
                step("Evaluate the three pieces", f"\[A={nice_latex(geometric)}\]"),
                step("Signed-area check", f"The signed integral would be \(\\int_0^\\pi f(x)dx={nice_latex(signed)}\), which is different from the geometric area."),
            ]
            ans = f"A = {nice_latex(geometric)}"
            out.append({
                "source": source, "title": "Area", "prompt": prompt,
                "choices": mc_choices(ans, f"{nice_latex(signed)}", f"{nice_latex(geometric / 2)}", f"{nice_latex(2 * geometric)}"),
                "steps": steps, "finalAnswer": ans,
                "insight": "Definite integrals give signed area. For total geometric area, split at every x-intercept and reverse the sign on below-axis pieces.",
                "visual": "area", "difficulty": diff,
                "visualParams": {"method": "area", "xMin": 0, "xMax": float(sp.pi), "bottom": {"t": "c", "v": 0}, "top": {"t": "sin", "a": 1, "b": -0.5}},
                "equations": equations_kit("area", setup),
            })
            continue
        elif case == 13:
            # A compact comparison problem: net change can vanish even when
            # the total geometric area is nonzero.
            f = x - 2
            signed = sp.integrate(f, (x, 0, 4))
            geometric = sp.integrate(-f, (x, 0, 2)) + sp.integrate(f, (x, 2, 4))
            prompt = (
                "For \(y=x-2\) on \([0,4]\), find both the signed area and the "
                "total geometric area relative to the \(x\)-axis."
            )
            setup = "\[A_{\\mathrm{signed}}=\\int_0^4(x-2)dx,\\quad A_{\\mathrm{total}}=\\int_0^2(2-x)dx+\\int_2^4(x-2)dx\]"
            ans = f"(A_{{\\mathrm{{signed}}}},A_{{\\mathrm{{total}}}})=({signed},{geometric})"
            steps = [
                step("Locate the sign change", "The line crosses the axis at \(x=2\), so the total area needs two pieces."),
                step("Net signed area", f"\[A_{{\\mathrm{{signed}}}}=\\int_0^4(x-2)dx={signed}\]"),
                step("Total geometric area", f"\[A_{{\\mathrm{{total}}}}=\\int_0^2(2-x)dx+\\int_2^4(x-2)dx={geometric}\]"),
            ]
            out.append({
                "source": source, "title": "Area", "prompt": prompt,
                "choices": mc_choices(ans, "(0,0)", "(4,0)", "(0,2)"),
                "steps": steps, "finalAnswer": ans,
                "insight": "Signed area measures cancellation; geometric area measures total magnitude. They agree only when the integrand keeps one sign.",
                "visual": "area", "difficulty": diff,
                "visualParams": {"method": "area", "xMin": 0, "xMax": 4, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": 1, "b": -2}},
                "equations": equations_kit("area", setup),
            })
            continue
        else:
            # Horizontal strips: between x = y and x = m (line) / parabola-friendly
            m = 2 + tier + rep
            # region: x = y^2 (left) and x = m y (right) from y=0 to y=m
            left_x = y**2
            right_x = m * y
            hi = m
            width = right_x - left_x
            val = sp.integrate(width, (y, 0, hi))
            prompt = (
                f"Use horizontal strips to find the area enclosed by "
                f"\\(x=y^2\\) and \\(x={m}y\\)."
            )
            setup = (
                f"Intersections at \\(y=0\\) and \\(y={m}\\). Horizontal strip length "
                f"\\({m}y-y^2\\): \\[A=\\int_0^{{{m}}}({m}y-y^2)\\,dy\\]"
            )
            vp = {
                "method": "area",
                "orientation": "horizontal",
                "yMin": 0,
                "yMax": m,
                "xMin": 0,
                "xMax": m * m,
                "left": {"t": "pow", "a": 1, "n": 2},
                "right": {"t": "lin", "a": m},
                "bottom": {"t": "c", "v": 0},
                "top": {"t": "lin", "a": m},  # y = x/m vertical view of same enclosure with y=x^2
            }
            # also valid as vertical: between y=x/m and y=√x — keep horizontal setup primary
            compute = {
                "expr": width, "a": 0, "b": hi, "var": y, "label": "A",
                "parts": {
                    "right": f"{m}y", "left": "y^{2}", "width": f"{m}y-y^{{2}}",
                    "height": f"{m}y-y^{{2}}", "var": "y", "lo": 0, "hi": hi,
                    "orientation": "horizontal",
                },
                "display_integrand": f"{m}y-y^{{2}}",
            }
        out.append(custom_problem(
            source, "Area", prompt, f"A = {sp.latex(sp.simplify(val))}", setup, "area", diff, vp,
            "Area is accumulated strip length × thickness. Vertical strips use (top − bottom) dx; horizontal strips use (right − left) dy.",
            compute=compute,
        ))
    return out


def catalog_volumes_varied():
    """12 distinct volume methods incl. horizontal (dy) slices; 20/20/10 difficulty."""
    out = []
    N_VOL = 12
    for i in range(PER_TOPIC):
        case = i % N_VOL
        diff = difficulty_for_index(i)
        tier = difficulty_tier(diff)
        rep = (i // N_VOL) % 2
        source = f"OpenStax Vol. 1 §6.2 / Briggs §6.3-6.4 volume concept {case + 1}, item {i + 1}"
        bnd = 1 + tier + rep
        compute = None
        if case == 0:
            # Disk about x-axis: y = x^2 or higher
            if tier == 0:
                f = x**2
                r_tex = "x^{2}"
                top = {"t": "pow", "a": 1, "n": 2}
                hi = 1 + rep
            elif tier == 1:
                f = (1 + rep) * x**2
                r_tex = f"{1 + rep}x^{{2}}" if rep else "x^{2}"
                if 1 + rep != 1:
                    r_tex = f"{1 + rep} x^{{2}}"
                top = {"t": "pow", "a": 1 + rep, "n": 2}
                hi = 2
            else:
                f = x**3 + (1 + rep)
                r_tex = expr_latex(f)
                top = {"t": "poly", "k": [1 + rep, 0, 0, 1]}
                hi = 1
            ans = sp.pi * sp.integrate(f**2, (x, 0, hi))
            prompt = f"Use disks: rotate the region under \\(y={expr_latex(f)}\\) on \\([0,{hi}]\\) about the \\(x\\)-axis."
            setup = f"\\[V=\\pi\\int_0^{{{hi}}}({expr_latex(f)})^2\\,dx\\]"
            vp = {"method": "disk-x", "xMin": 0, "xMax": hi, "axisY": 0, "axisLabel": "y = 0", "bottom": {"t": "c", "v": 0}, "top": top}
            compute = {
                "expr": f**2, "a": 0, "b": hi, "label": "V", "scale": sp.pi,
                "display_integrand": f"({expr_latex(f)})^{{2}}",
                "setup_display": setup, "keep_scale_inside": True,
                "parts": {"R": r_tex, "var": "x", "lo": 0, "hi": hi},
            }
        elif case == 1:
            # Disk about horizontal line y = axis, curve y = x^2
            axis = 2 + tier + rep
            f = x**2
            hi = 1
            r_tex = f"{axis}-x^{{2}}"
            ans = sp.pi * sp.integrate((axis - f) ** 2, (x, 0, hi))
            prompt = f"Rotate the region between \\(y=x^2\\) and \\(y={axis}\\) on \\([0,{hi}]\\) about \\(y={axis}\\)."
            setup = f"\\[V=\\pi\\int_0^{{{hi}}}({axis}-x^2)^2\\,dx\\]"
            vp = {
                "method": "disk-x", "xMin": 0, "xMax": hi, "axisY": axis, "axisLabel": f"y = {axis}",
                "bottom": {"t": "pow", "a": 1, "n": 2}, "top": {"t": "c", "v": axis},
                "sampleLabel": "sample x", "measureLabel": "disk radius",
                "formula": [f"R={r_tex}", "A=\\pi R^{2}", f"dV=\\pi({r_tex})^{{2}}\\,dx"],
            }
            compute = {
                "expr": (axis - f) ** 2, "a": 0, "b": hi, "label": "V", "scale": sp.pi,
                "display_integrand": f"({r_tex})^{{2}}", "setup_display": setup, "keep_scale_inside": True,
                "parts": {"R": r_tex, "var": "x", "lo": 0, "hi": hi, "axis": f"y={axis}"},
            }
        elif case == 2:
            # Washer: region between y=x and y=x^2 about x-axis
            hi = 1
            outer, inner = x, x**2
            if tier >= 1:
                # scale: between y = mx and y = x^2
                m = 1 + tier
                outer, inner = m * x, x**2
                hi = m
            r_out_tex, r_in_tex = expr_latex(outer), expr_latex(inner)
            ans = sp.pi * sp.integrate(outer**2 - inner**2, (x, 0, hi))
            prompt = (
                f"Use washers to rotate the region between \\(y={r_out_tex}\\) and \\(y={r_in_tex}\\) "
                f"about the \\(x\\)-axis (from their intersections)."
            )
            setup = f"\\[V=\\pi\\int_0^{{{hi}}}\\big[({r_out_tex})^2-({r_in_tex})^2\\big]\\,dx\\]"
            vp = {
                "method": "washer-x", "xMin": 0, "xMax": float(hi), "axisY": 0, "axisLabel": "y = 0",
                "bottom": {"t": "pow", "a": 1, "n": 2},
                "top": {"t": "lin", "a": float(outer.as_poly(x).LC()) if outer.is_polynomial(x) else 1},
            }
            compute = {
                "expr": outer**2 - inner**2, "a": 0, "b": hi, "label": "V", "scale": sp.pi,
                "display_integrand": f"({r_out_tex})^{{2}}-({r_in_tex})^{{2}}",
                "setup_display": setup, "keep_scale_inside": True,
                "parts": {"R_out": r_out_tex, "R_in": r_in_tex, "var": "x", "lo": 0, "hi": hi},
            }
        elif case == 3:
            # Shell about y-axis under a parabola arch
            a = 2 + tier + rep
            f = a * x - x**2
            hi = a
            ans = 2 * sp.pi * sp.integrate(x * f, (x, 0, hi))
            prompt = f"Use shells to rotate the region under \\(y={expr_latex(f)}\\) on \\([0,{hi}]\\) about the \\(y\\)-axis."
            setup = f"\\[V=2\\pi\\int_0^{{{hi}}}x({expr_latex(f)})\\,dx\\]"
            vp = {
                "method": "shell-y", "xMin": 0, "xMax": hi, "axisX": 0, "axisLabel": "x = 0",
                "bottom": {"t": "c", "v": 0}, "top": {"t": "poly", "k": [0, a, -1]},
            }
            compute = {
                "expr": x * f, "a": 0, "b": hi, "label": "V", "scale": 2 * sp.pi,
                "display_integrand": f"x({expr_latex(f)})", "setup_display": setup, "keep_scale_inside": True,
                "parts": {"r": "x", "h": expr_latex(f), "var": "x", "lo": 0, "hi": hi},
            }
        elif case == 4:
            # Shell about vertical line x = axis, under y = x^2
            axis = 2 + tier + rep
            f = x**2
            hi = 1 + (1 if tier else 0)
            ans = 2 * sp.pi * sp.integrate((axis - x) * f, (x, 0, hi))
            prompt = f"Use shells to rotate the region under \\(y=x^2\\) on \\([0,{hi}]\\) about the vertical line \\(x={axis}\\)."
            setup = f"\\[V=2\\pi\\int_0^{{{hi}}}({axis}-x)(x^2)\\,dx\\]"
            vp = {
                "method": "shell-y", "xMin": 0, "xMax": hi, "axisX": axis, "axisLabel": f"x = {axis}",
                "bottom": {"t": "c", "v": 0}, "top": {"t": "pow", "a": 1, "n": 2},
            }
            compute = {
                "expr": (axis - x) * f, "a": 0, "b": hi, "label": "V", "scale": 2 * sp.pi,
                "display_integrand": f"({axis}-x)(x^{{2}})", "setup_display": setup, "keep_scale_inside": True,
                "parts": {"r": f"{axis}-x", "h": "x^{2}", "var": "x", "lo": 0, "hi": hi, "axis": f"x={axis}"},
            }
        elif case == 5:
            # Square cross sections on base under y = sqrt(x) or parabola
            hi = 2 + tier
            if tier == 0:
                s = sp.sqrt(x)
                s_tex = "\\sqrt{x}"
                top = {"t": "sqrt", "a": 1}
            else:
                s = hi - x**2 / hi  # positive on [0,hi] roughly — use sqrt for stability
                s = (1 + rep) * sp.sqrt(x) + 1
                s_tex = expr_latex(s)
                top = {"t": "sqrt", "a": 1 + rep, "b": 1}
            ans = sp.integrate(s**2, (x, 0, hi))
            prompt = (
                f"The base of a solid is the region under \\(y={s_tex}\\) on \\([0,{hi}]\\). "
                f"Cross sections perpendicular to the \\(x\\)-axis are squares. Find the volume."
            )
            setup = f"\\[V=\\int_0^{{{hi}}}({s_tex})^2\\,dx\\]"
            vp = {
                "method": "cross-square", "xMin": 0, "xMax": hi,
                "bottom": {"t": "c", "v": 0}, "top": top,
                "sampleLabel": "sample x", "measureLabel": "square side",
                "formula": [f"s={s_tex}", "A=s^2", "dV=s^2\\,dx"],
            }
            compute = {
                "expr": s**2, "a": 0, "b": hi, "label": "V", "scale": 1,
                "display_integrand": f"({s_tex})^{{2}}", "setup_display": setup,
                "parts": {"s": s_tex, "var": "x", "lo": 0, "hi": hi},
            }
        elif case == 6:
            # Semicircle cross sections on base under a curve
            hi = 2 + tier
            d = sp.sqrt(x) + (1 if tier else 0)
            if tier == 0:
                d = sp.sqrt(x)
            d_tex = expr_latex(d)
            ans = sp.pi / 8 * sp.integrate(d**2, (x, 0, hi))
            prompt = (
                f"Cross sections perpendicular to the \\(x\\)-axis are semicircles with diameter "
                f"running from the \\(x\\)-axis up to \\(y={d_tex}\\) on \\([0,{hi}]\\). Find the volume."
            )
            setup = f"\\[V=\\int_0^{{{hi}}}\\frac{{\\pi}}{{8}}({d_tex})^2\\,dx\\]"
            vp = {
                "method": "cross-semicircle", "xMin": 0, "xMax": hi,
                "bottom": {"t": "c", "v": 0}, "top": {"t": "sqrt", "a": 1},
                "sampleLabel": "sample x", "measureLabel": "diameter",
                "formula": [f"d={d_tex}", "A=\\frac{\\pi}{8}d^2", "dV=\\frac{\\pi}{8}d^2\\,dx"],
            }
            compute = {
                "expr": d**2, "a": 0, "b": hi, "label": "V", "scale": sp.pi / 8,
                "display_integrand": f"({d_tex})^{{2}}", "setup_display": setup, "keep_scale_inside": True,
                "parts": {"d": d_tex, "var": "x", "lo": 0, "hi": hi},
            }
        elif case == 7:
            # Disk/washer about y=h with sqrt radius
            h = 2 + tier + rep
            f = sp.sqrt(x)
            hi = 1 + tier
            r_tex = f"{h}-\\sqrt{{x}}"
            ans = sp.pi * sp.integrate((h - f) ** 2, (x, 0, hi))
            prompt = f"Rotate the region between \\(y=\\sqrt{{x}}\\) and \\(y={h}\\) on \\([0,{hi}]\\) about \\(y={h}\\)."
            setup = f"\\[V=\\pi\\int_0^{{{hi}}}({h}-\\sqrt{{x}})^2\\,dx\\]"
            vp = {
                "method": "disk-x", "xMin": 0, "xMax": hi, "axisY": h, "axisLabel": f"y = {h}",
                "bottom": {"t": "sqrt", "a": 1}, "top": {"t": "c", "v": h},
            }
            compute = {
                "expr": (h - f) ** 2, "a": 0, "b": hi, "label": "V", "scale": sp.pi,
                "display_integrand": f"({h}-\\sqrt{{x}})^{{2}}", "setup_display": setup, "keep_scale_inside": True,
                "parts": {"R": r_tex, "var": "x", "lo": 0, "hi": hi, "axis": f"y={h}"},
            }
        elif case == 8:
            # Shells for region between y=x and y=x^2 about y-axis
            hi = 1
            height = x - x**2
            if tier >= 1:
                m = 1 + tier
                height = m * x - x**2
                hi = m
            ans = 2 * sp.pi * sp.integrate(x * height, (x, 0, hi))
            prompt = (
                f"Use shells to rotate the region between \\(y={expr_latex(height + x**2)}\\) and "
                f"\\(y=x^2\\) about the \\(y\\)-axis."
            )
            setup = f"\\[V=2\\pi\\int_0^{{{hi}}}x({expr_latex(height)})\\,dx\\]"
            vp = {
                "method": "shell-y", "xMin": 0, "xMax": float(hi), "axisX": 0, "axisLabel": "x = 0",
                "bottom": {"t": "pow", "a": 1, "n": 2}, "top": {"t": "lin", "a": float((height + x**2).coeff(x))},
            }
            compute = {
                "expr": x * height, "a": 0, "b": hi, "label": "V", "scale": 2 * sp.pi,
                "display_integrand": f"x({expr_latex(height)})", "setup_display": setup, "keep_scale_inside": True,
                "parts": {"r": "x", "h": expr_latex(height), "var": "x", "lo": 0, "hi": hi},
            }
        elif case == 9:
            # Disk with square-root radius about x-axis
            a = 1 + tier + rep
            hi = 2 + tier
            f = a * sp.sqrt(x)
            r_tex = f"{a}\\sqrt{{x}}" if a != 1 else "\\sqrt{x}"
            ans = sp.pi * sp.integrate(f**2, (x, 0, hi))
            prompt = f"Rotate \\(y={expr_latex(f)}\\), \\(0\\le x\\le {hi}\\), about the \\(x\\)-axis."
            setup = f"\\[V=\\pi\\int_0^{{{hi}}}({expr_latex(f)})^2\\,dx\\]"
            vp = {
                "method": "disk-x", "xMin": 0, "xMax": hi, "axisY": 0, "axisLabel": "y = 0",
                "bottom": {"t": "c", "v": 0}, "top": {"t": "sqrt", "a": a},
            }
            compute = {
                "expr": f**2, "a": 0, "b": hi, "label": "V", "scale": sp.pi,
                "display_integrand": f"({r_tex})^{{2}}", "setup_display": setup, "keep_scale_inside": True,
                "parts": {"R": r_tex, "var": "x", "lo": 0, "hi": hi},
            }
        elif case == 10:
            # Horizontal disks about y-axis: x = g(y) (e.g. x = √y or x = y/m)
            m = 1 + tier + rep
            hi = 1 + tier + rep
            # x = √(m y) or simply x = √y scaled: region under y = x^2/m from x=0 to √(m*hi)
            # With dy: R = x = √(m y) on y in [0, hi] if y = x^2/m → x = √(m y)
            g = sp.sqrt(m * y)
            r_tex = f"\\sqrt{{{m}y}}" if m != 1 else "\\sqrt{y}"
            x_eq = r_tex
            ans = sp.pi * sp.integrate(g**2, (y, 0, hi))
            prompt = (
                f"Use horizontal disks: rotate the region bounded by \\(x={x_eq}\\), "
                f"\\(y=0\\), and \\(y={hi}\\) about the \\(y\\)-axis."
            )
            setup = (
                f"\\[V=\\pi\\int_0^{{{hi}}}\\big({r_tex}\\big)^2\\,dy="
                f"\\pi\\int_0^{{{hi}}}{m}y\\,dy\\]" if m != 1 else
                f"\\[V=\\pi\\int_0^{{{hi}}}\\big(\\sqrt{{y}}\\big)^2\\,dy=\\pi\\int_0^{{{hi}}}y\\,dy\\]"
            )
            vp = {
                "method": "disk-y",
                "orientation": "horizontal",
                "axisX": 0,
                "axisLabel": "x = 0",
                "yMin": 0,
                "yMax": hi,
                "xMin": 0,
                "xMax": float(sp.sqrt(m * hi)),
                "left": {"t": "c", "v": 0},
                "right": {"t": "sqrt", "a": sp.sqrt(m) if m != 1 else 1},
                "bottom": {"t": "c", "v": 0},
                "top": {"t": "pow", "a": 1 / m if m else 1, "n": 2},
            }
            compute = {
                "expr": g**2, "a": 0, "b": hi, "var": y, "label": "V", "scale": sp.pi,
                "display_integrand": f"({r_tex})^{{2}}", "setup_display": setup, "keep_scale_inside": True,
                "parts": {"R": r_tex, "var": "y", "lo": 0, "hi": hi},
            }
        else:
            # Horizontal washers / shells about x-axis with dy: region between x=y and x=√y style
            # Region: y = x and y = x^2 on [0,1] → with dy: x_right = √y, x_left = y
            # About x-axis with shells (horizontal strips // x-axis): r = y, h = √y - y
            hi = 1
            height = sp.sqrt(y) - y
            if tier >= 1:
                # scale: between y = x/m and y = x^2 → x = m y and x = √y, intersections 0 and 1/m^2? 
                # Keep classic y=x, y=x^2 about x-axis with horizontal shells
                pass
            ans = 2 * sp.pi * sp.integrate(y * height, (y, 0, hi))
            prompt = (
                "Use horizontal cylindrical shells to rotate the region between "
                "\\(y=x\\) and \\(y=x^2\\) about the \\(x\\)-axis."
            )
            setup = (
                "Solve for \\(x\\): right \\(x=\\sqrt{y}\\), left \\(x=y\\). "
                f"\\[V=2\\pi\\int_0^{{{hi}}}y\\big(\\sqrt{{y}}-y\\big)\\,dy\\]"
            )
            vp = {
                "method": "shell-x",
                "orientation": "horizontal",
                "axisY": 0,
                "axisLabel": "y = 0",
                "yMin": 0,
                "yMax": hi,
                "xMin": 0,
                "xMax": 1,
                "left": {"t": "lin", "a": 1},
                "right": {"t": "sqrt", "a": 1},
                "bottom": {"t": "c", "v": 0},
                "top": {"t": "lin", "a": 1},
            }
            compute = {
                "expr": y * height, "a": 0, "b": hi, "var": y, "label": "V", "scale": 2 * sp.pi,
                "display_integrand": "y(\\sqrt{y}-y)", "setup_display": setup, "keep_scale_inside": True,
                "parts": {"r": "y", "h": "\\sqrt{y}-y", "var": "y", "lo": 0, "hi": hi},
            }
        out.append(custom_problem(
            source, "Volume", prompt, f"V = {sp.latex(sp.simplify(ans))}", setup, "volume", diff, vp,
            "Pick disks/washers (slices ⊥ axis) or shells (slices ∥ axis). Horizontal strips integrate with dy; vertical strips with dx.",
            compute=compute,
        ))
    return out


def catalog_applications_varied():
    """48 varied application concepts, including modeling and decision problems."""
    out = []
    N_APP = 48
    for i in range(PER_TOPIC):
        case = i % N_APP
        diff = difficulty_for_index(i)
        tier = difficulty_tier(diff)
        rep = (i // N_APP) % 2
        j = tier + rep
        source = f"OpenStax Vol. 1 §6.5 / Briggs application concept {case + 1}, item {i + 1}"
        compute = None
        label = "W"
        units_insight = (
            "Word problems: decide what accumulates (work, distance, volume, energy). "
            "If force, lift, or rate changes, write a thin-slice integral."
        )
        visual_kind = "area"

        # --- Springs (0–3) ---
        if case == 0:
            k = 40 + 20 * tier + 10 * rep
            d = [sp.Rational(1, 4), sp.Rational(1, 2), sp.Rational(3, 4)][tier]
            W = sp.integrate(k * x, (x, 0, d))
            prompt = f"A spring with \\(k={k}\\) N/m is stretched \\({sp.latex(d)}\\) m from natural length. Find the work."
            setup = f"\\[W=\\int_0^{{{sp.latex(d)}}}{k}x\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": float(d), "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": k}}
            compute = {"expr": k * x, "a": 0, "b": d, "label": "W", "units": "J", "parts": {"k": k, "var": "x"}}
        elif case == 1:
            k = 50 + 15 * tier + 5 * rep
            lo, hi = sp.Rational(1, 4), sp.Rational(1, 2) + sp.Rational(tier, 4)
            W = sp.integrate(k * x, (x, lo, hi))
            prompt = (
                f"A spring with \\(k={k}\\) N/m is already stretched \\({sp.latex(lo)}\\) m. "
                f"Find the work to stretch it further to \\({sp.latex(hi)}\\) m."
            )
            setup = f"\\[W=\\int_{{{sp.latex(lo)}}}^{{{sp.latex(hi)}}}{k}x\\,dx\\]"
            vp = {"method": "area", "xMin": float(lo), "xMax": float(hi), "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": k}}
            compute = {"expr": k * x, "a": lo, "b": hi, "label": "W", "units": "J"}
        elif case == 2:
            k = 80 + 20 * tier
            d = sp.Rational(1, 5) + sp.Rational(rep, 10)
            W = sp.integrate(k * x, (x, 0, d))
            prompt = f"Compress a spring with \\(k={k}\\) N/m a distance \\({sp.latex(d)}\\) m from equilibrium. Find the work."
            setup = f"Hooke still gives \\(F=kx\\): \\[W=\\int_0^{{{sp.latex(d)}}}{k}x\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": float(d), "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": k}}
            compute = {"expr": k * x, "a": 0, "b": d, "label": "W", "units": "J"}
        elif case == 3:
            k = 100 + 25 * tier + 10 * rep
            lo, hi = sp.Rational(1, 5), 1
            W = sp.integrate(k * x, (x, lo, hi))
            prompt = (
                f"A spring (\\(k={k}\\) N/m) is stretched from \\({sp.latex(lo)}\\) m past natural length "
                f"to \\({hi}\\) m past natural length. Find the work."
            )
            setup = f"\\[W=\\int_{{{sp.latex(lo)}}}^{{{hi}}}{k}x\\,dx\\]"
            vp = {"method": "area", "xMin": float(lo), "xMax": float(hi), "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": k}}
            compute = {"expr": k * x, "a": lo, "b": hi, "label": "W", "units": "J"}

        # --- Variable force (4–9) ---
        elif case == 4:
            F = (20 + 5 * j) + (3 + j) * x
            d = 3 + tier + rep
            W = sp.integrate(F, (x, 0, d))
            prompt = f"A variable force \\(F(x)={expr_latex(F)}\\) N moves an object from \\(0\\) to \\({d}\\) m. Find the work."
            setup = f"\\[W=\\int_0^{{{d}}}({expr_latex(F)})\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": d, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": 3 + j, "b": 20 + 5 * j}}
            compute = {"expr": F, "a": 0, "b": d, "label": "W", "units": "J", "display_integrand": expr_latex(F)}
        elif case == 5:
            F = 10 + 4 * x + x**2
            d = 2 + tier + rep
            W = sp.integrate(F, (x, 0, d))
            prompt = f"Force \\(F(x)={expr_latex(F)}\\) N acts from \\(x=0\\) to \\(x={d}\\). Find the work."
            setup = f"\\[W=\\int_0^{{{d}}}({expr_latex(F)})\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": d, "bottom": {"t": "c", "v": 0}, "top": {"t": "poly", "k": [10, 4, 1]}}
            compute = {"expr": F, "a": 0, "b": d, "label": "W", "units": "J"}
        elif case == 6:
            c = 2 + j
            F = c * sp.sqrt(x)
            L = 4 + tier
            W = sp.integrate(F, (x, 0, L))
            prompt = f"A force varies as \\(F(x)={expr_latex(F)}\\) N over \\([0,{L}]\\). Find the work."
            setup = f"\\[W=\\int_0^{{{L}}}{expr_latex(F)}\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": L, "bottom": {"t": "c", "v": 0}, "top": {"t": "sqrt", "a": c}}
            compute = {"expr": F, "a": 0, "b": L, "label": "W", "units": "J"}
        elif case == 7:
            F = (5 + j) * sp.exp(-x / 2)
            d = 2 + tier
            W = sp.integrate(F, (x, 0, d))
            prompt = f"Force \\(F(x)={expr_latex(F)}\\) N acts from \\(0\\) to \\({d}\\) m. Find the work."
            setup = f"\\[W=\\int_0^{{{d}}}{expr_latex(F)}\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": d, "bottom": {"t": "c", "v": 0}, "top": {"t": "exp", "s": 5 + j, "a": -0.5}}
            compute = {"expr": F, "a": 0, "b": d, "label": "W", "units": "J"}
        elif case == 8:
            F = (8 + j) + (2 + rep) * sp.sin(x)
            d = sp.pi
            W = sp.integrate(F, (x, 0, d))
            prompt = f"Force \\(F(x)={expr_latex(F)}\\) N acts on \\([0,\\pi]\\). Find the work."
            setup = f"\\[W=\\int_0^{{\\pi}}({expr_latex(F)})\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": 3.1416, "bottom": {"t": "c", "v": 0}, "top": {"t": "sin", "a": 2 + rep, "b": 8 + j}}
            compute = {"expr": F, "a": 0, "b": d, "label": "W", "units": "J"}
        elif case == 9:
            # piecewise force: constant then linear
            a, b_end = 2 + tier, 4 + tier + rep
            F1, F2 = 10 + 2 * j, 10 + 2 * j + 3 * (x - a)
            W = sp.integrate(sp.Integer(F1), (x, 0, a)) + sp.integrate(F2, (x, a, b_end))
            prompt = (
                f"Force is constant \\(F={F1}\\) N on \\([0,{a}]\\) and "
                f"\\(F(x)={expr_latex(F2)}\\) N on \\([{a},{b_end}]\\). Find the total work."
            )
            setup = f"\\[W=\\int_0^{{{a}}}{F1}\\,dx+\\int_{{{a}}}^{{{b_end}}}({expr_latex(F2)})\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": b_end, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": 3, "b": F1 - 3 * a}}
            p1 = full_definite_eval_steps(sp.Integer(F1), 0, a, x, label="W_1")
            p2 = full_definite_eval_steps(F2, a, b_end, x, label="W_2")
            out.append({
                "source": source, "title": "Applications", "prompt": prompt,
                "choices": mc_choices(f"W = {nice_latex(sp.simplify(W))}", f"2W", f"W/2", f"{F1 * b_end}"),
                "steps": [
                    step("Strategy: split where the force law changes", "Write one integral per piece, evaluate each, then add."),
                ] + p1 + p2 + [
                    step("Total work", f"\\[W=W_1+W_2={nice_latex(sp.simplify(W))}\\text{{ J}}\\]"),
                ],
                "finalAnswer": f"W = {nice_latex(sp.simplify(W))}\\text{{ J}}",
                "insight": units_insight, "visual": "area", "difficulty": diff, "visualParams": vp,
                "equations": equations_kit("work", setup),
            })
            continue

        # --- Pumping tanks (10–17) ---
        elif case == 10:
            width, depth = 2 + j, 2 + tier
            W = sp.Rational(9800 * width * depth**2, 2)
            prompt = (
                f"A rectangular tank is \\({width}\\) m wide and filled to depth \\({depth}\\) m. "
                f"Pump all water to the top edge (\\(\\rho g=9800\\)). Find the work."
            )
            setup = f"\\[W=9800\\int_0^{{{depth}}}{width}({depth}-y)\\,dy\\]"
            vp = {"method": "area", "xMin": 0, "xMax": depth, "bottom": {"t": "c", "v": 0}, "top": {"t": "c", "v": width}}
            compute = {
                "expr": width * (depth - y), "a": 0, "b": depth, "var": y, "label": "W", "scale": 9800, "units": "J",
                "parts": {"A": str(width), "lift": f"{depth}-y", "rhog": "9800", "var": "y"},
                "display_integrand": f"{width}({depth}-y)",
            }
        elif case == 11:
            width, depth, spout = 3 + j, 2 + tier, 1 + rep
            W = 9800 * sp.integrate(width * (depth + spout - y), (y, 0, depth))
            prompt = (
                f"Rectangular tank width \\({width}\\) m, filled to \\({depth}\\) m. "
                f"Pump to a spout \\({spout}\\) m above the top (\\(\\rho g=9800\\)). Find the work."
            )
            setup = f"\\[W=9800\\int_0^{{{depth}}}{width}({depth}+{spout}-y)\\,dy\\]"
            vp = {"method": "area", "xMin": 0, "xMax": depth, "bottom": {"t": "c", "v": 0}, "top": {"t": "c", "v": width}}
            compute = {
                "expr": width * (depth + spout - y), "a": 0, "b": depth, "var": y,
                "label": "W", "scale": 9800, "units": "J",
                "display_integrand": f"{width}({depth}+{spout}-y)",
            }
        elif case == 12:
            # cylindrical tank radius R, depth H — horizontal slabs
            R, H = 1 + tier + rep, 2 + tier
            A = sp.pi * R**2
            W = 9800 * sp.integrate(A * (H - y), (y, 0, H))
            prompt = (
                f"A vertical cylindrical tank has radius \\({R}\\) m and is filled to depth \\({H}\\) m. "
                f"Pump all water to the top (\\(\\rho g=9800\\)). Find the work."
            )
            setup = f"\\[W=9800\\int_0^{{{H}}}\\pi({R})^2({H}-y)\\,dy\\]"
            vp = {"method": "area", "xMin": 0, "xMax": H, "bottom": {"t": "c", "v": 0}, "top": {"t": "c", "v": float(sp.pi * R**2)}}
            compute = {
                "expr": A * (H - y), "a": 0, "b": H, "var": y, "label": "W", "scale": 9800, "units": "J",
                "display_integrand": f"\\pi({R})^{{2}}({H}-y)",
            }
        elif case == 13:
            # triangular trough cross-section: width grows with depth
            top_w, H = 2 + j, 3 + tier
            # at height y from bottom, width = (top_w/H)*y, length L=4
            L = 4 + rep
            W = 9800 * sp.integrate(L * (top_w / H) * y * (H - y), (y, 0, H))
            prompt = (
                f"A trough of length \\({L}\\) m has equilateral-triangle ends of height \\({H}\\) m and top width \\({top_w}\\) m, "
                f"filled with water. Pump to the top (\\(\\rho g=9800\\)). Find the work."
            )
            setup = (
                f"At height \\(y\\) from the bottom, slab width is \\(\\frac{{{top_w}}}{{{H}}}y\\): "
                f"\\[W=9800\\int_0^{{{H}}}{L}\\cdot\\frac{{{top_w}}}{{{H}}}y\\cdot({H}-y)\\,dy\\]"
            )
            vp = {"method": "area", "xMin": 0, "xMax": H, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": top_w / H}}
            compute = {
                "expr": L * (top_w / H) * y * (H - y), "a": 0, "b": H, "var": y,
                "label": "W", "scale": 9800, "units": "J",
            }
        elif case == 14:
            # pump only half the tank
            width, depth = 2 + j, 4 + tier
            half = depth // 2
            W = 9800 * sp.integrate(width * (depth - y), (y, half, depth))
            prompt = (
                f"A rectangular tank is \\({width}\\) m wide and filled to \\({depth}\\) m. "
                f"Pump only the top half of the water to the top edge (\\(\\rho g=9800\\)). Find the work."
            )
            setup = f"Water from \\(y={half}\\) to \\(y={depth}\\): \\[W=9800\\int_{{{half}}}^{{{depth}}}{width}({depth}-y)\\,dy\\]"
            vp = {"method": "area", "xMin": half, "xMax": depth, "bottom": {"t": "c", "v": 0}, "top": {"t": "c", "v": width}}
            compute = {
                "expr": width * (depth - y), "a": half, "b": depth, "var": y,
                "label": "W", "scale": 9800, "units": "J",
            }
        elif case == 15:
            # measure y from the top: lift = y
            width, depth = 3 + j, 2 + tier
            W = 9800 * sp.integrate(width * y, (y, 0, depth))
            prompt = (
                f"A rectangular tank is \\({width}\\) m wide and filled to depth \\({depth}\\) m. "
                f"With \\(y\\) measured down from the top, set up and evaluate the work to empty the tank (\\(\\rho g=9800\\))."
            )
            setup = f"Lift distance equals \\(y\\): \\[W=9800\\int_0^{{{depth}}}{width}\\,y\\,dy\\]"
            vp = {"method": "area", "xMin": 0, "xMax": depth, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": width}}
            compute = {
                "expr": width * y, "a": 0, "b": depth, "var": y, "label": "W", "scale": 9800, "units": "J",
                "display_integrand": f"{width}y",
            }
        elif case == 16:
            # hemispherical bowl radius R, pump to rim
            R = 2 + tier
            # horizontal radius at height y from bottom: √(R^2 - (R-y)^2) for lower hemisphere...
            # simpler: inverted cone-like known form — use cylindrical radius √(2Ry - y^2)
            # From bottom y=0 to y=R, radius of slice = √(2 R y - y^2)
            W = 9800 * sp.integrate(sp.pi * (2 * R * y - y**2) * (R - y), (y, 0, R))
            prompt = (
                f"A hemispherical bowl of radius \\({R}\\) m is full of water. "
                f"Pump all water to the rim (\\(\\rho g=9800\\)). Find the work."
            )
            setup = (
                f"At height \\(y\\) from the bottom, slice radius satisfies \\(r^2=2{R}y-y^2\\): "
                f"\\[W=9800\\int_0^{{{R}}}\\pi(2\\cdot{R}y-y^2)({R}-y)\\,dy\\]"
            )
            vp = {"method": "area", "xMin": 0, "xMax": R, "bottom": {"t": "c", "v": 0}, "top": {"t": "circle-upper", "R": R, "cx": 0, "cy": 0}}
            compute = {
                "expr": sp.pi * (2 * R * y - y**2) * (R - y), "a": 0, "b": R, "var": y,
                "label": "W", "scale": 9800, "units": "J",
            }
        elif case == 17:
            # leak while pumping: not needed — variable density or partial depth fill
            width, fill, tank_h = 2 + j, 2 + tier, 4 + tier
            W = 9800 * sp.integrate(width * (tank_h - y), (y, 0, fill))
            prompt = (
                f"A tank is \\({width}\\) m wide and \\({tank_h}\\) m tall but only filled to \\({fill}\\) m. "
                f"Pump the water over the top of the tank (\\(\\rho g=9800\\)). Find the work."
            )
            setup = f"\\[W=9800\\int_0^{{{fill}}}{width}({tank_h}-y)\\,dy\\]"
            vp = {"method": "area", "xMin": 0, "xMax": fill, "bottom": {"t": "c", "v": 0}, "top": {"t": "c", "v": width}}
            compute = {
                "expr": width * (tank_h - y), "a": 0, "b": fill, "var": y,
                "label": "W", "scale": 9800, "units": "J",
            }

        # --- Rope / chain / cable (18–22) ---
        elif case == 18:
            L, rho = 8 + 2 * j, 2 + tier
            W = sp.integrate(rho * y, (y, 0, L))
            prompt = f"A rope of length \\({L}\\) m weighs \\({rho}\\) N/m. Find the work to lift the entire rope to the top."
            setup = f"\\[W=\\int_0^{{{L}}}{rho}y\\,dy\\]"
            vp = {"method": "area", "xMin": 0, "xMax": L, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": rho}}
            compute = {"expr": rho * y, "a": 0, "b": L, "var": y, "label": "W", "units": "J", "display_integrand": f"{rho}y"}
        elif case == 19:
            L, rho = 10 + 2 * j, 3 + tier
            half = L // 2
            W = sp.integrate(rho * y, (y, 0, half))
            prompt = (
                f"A rope of length \\({L}\\) m and density \\({rho}\\) N/m hangs from a building. "
                f"Find the work to pull up only the first \\({half}\\) m of rope."
            )
            setup = f"\\[W=\\int_0^{{{half}}}{rho}y\\,dy\\]"
            vp = {"method": "area", "xMin": 0, "xMax": half, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": rho}}
            compute = {"expr": rho * y, "a": 0, "b": half, "var": y, "label": "W", "units": "J"}
        elif case == 20:
            L, rho, M = 12 + 2 * j, 2 + tier, 50 + 10 * j
            # chain with end mass M lifted full length: rope work + constant M*L
            W_rope = sp.integrate(rho * y, (y, 0, L))
            W = W_rope + M * L
            prompt = (
                f"A chain of length \\({L}\\) m weighs \\({rho}\\) N/m and has a \\({M}\\) N weight at the end. "
                f"Find the work to lift chain and weight to the top."
            )
            setup = f"\\[W=\\int_0^{{{L}}}{rho}y\\,dy+{M}\\cdot{L}\\]"
            vp = {"method": "area", "xMin": 0, "xMax": L, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": rho, "b": M}}
            steps = full_definite_eval_steps(rho * y, 0, L, y, label="W_{{\\text{chain}}}") + [
                step("Weight contribution", f"Constant force \\({M}\\) N through \\({L}\\) m: \\[W_{{\\text{{weight}}}}={M}\\cdot{L}={M * L}\\]"),
                step("Total", f"\\[W=W_{{\\text{{chain}}}}+W_{{\\text{{weight}}}}={nice_latex(sp.simplify(W))}\\text{{ J}}\\]"),
            ]
            out.append({
                "source": source, "title": "Applications", "prompt": prompt,
                "choices": mc_choices(f"W = {nice_latex(sp.simplify(W))}", f"2W", f"{M * L}", f"{nice_latex(W_rope)}"),
                "steps": [
                    step("Strategy: chain + payload", "Integrate the hanging chain, then add work on the end weight."),
                ] + steps,
                "finalAnswer": f"W = {nice_latex(sp.simplify(W))}\\text{{ J}}",
                "insight": units_insight, "visual": "area", "difficulty": diff, "visualParams": vp,
                "equations": equations_kit("work", setup),
            })
            continue
        elif case == 21:
            # building height H, rope longer than building — only H of rope lifted off ground
            H, rho = 6 + j, 4 + tier
            W = sp.integrate(rho * y, (y, 0, H))
            prompt = (
                f"A heavy cable weighs \\({rho}\\) N/m. It takes \\({H}\\) m of cable to reach the ground from a roof. "
                f"Find the work to pull the free end up to the roof (start with free end on the ground)."
            )
            setup = f"\\[W=\\int_0^{{{H}}}{rho}y\\,dy\\]"
            vp = {"method": "area", "xMin": 0, "xMax": H, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": rho}}
            compute = {"expr": rho * y, "a": 0, "b": H, "var": y, "label": "W", "units": "J"}
        elif case == 22:
            L, rho = 5 + j, 6 + 2 * tier
            # lift from table: half hanging initially
            hang = L // 2 if L >= 2 else 1
            W = sp.integrate(rho * y, (y, 0, hang))
            prompt = (
                f"A chain of length \\({L}\\) m and density \\({rho}\\) N/m has half its length hanging off a table. "
                f"Find the work to pull the hanging part onto the table."
            )
            setup = f"\\[W=\\int_0^{{{hang}}}{rho}y\\,dy\\]"
            vp = {"method": "area", "xMin": 0, "xMax": hang, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": rho}}
            compute = {"expr": rho * y, "a": 0, "b": hang, "var": y, "label": "W", "units": "J"}

        # --- Kinematics / accumulation (23–31) ---
        elif case == 23:
            v = (4 + rep) + (2 + j) * t
            T = 3 + tier
            W = sp.integrate(v, (t, 0, T))
            label = "s"
            prompt = f"Velocity is \\(v(t)={expr_latex(v, t)}\\) m/s for \\(0\\le t\\le {T}\\). Find distance traveled."
            setup = f"\\[s=\\int_0^{{{T}}}({expr_latex(v, t)})\\,dt\\]"
            vp = {"method": "area", "xMin": 0, "xMax": T, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": 2 + j, "b": 4 + rep}}
            compute = {"expr": v, "a": 0, "b": T, "var": t, "label": "s", "units": "m"}
        elif case == 24:
            v = (1 + j) * t + t**2
            T = 2 + tier
            W = sp.integrate(v, (t, 0, T))
            label = "s"
            prompt = f"Velocity \\(v(t)={expr_latex(v, t)}\\) m/s on \\([0,{T}]\\). Find the distance traveled."
            setup = f"\\[s=\\int_0^{{{T}}}({expr_latex(v, t)})\\,dt\\]"
            vp = {"method": "area", "xMin": 0, "xMax": T, "bottom": {"t": "c", "v": 0}, "top": {"t": "poly", "k": [0, 1 + j, 1]}}
            compute = {"expr": v, "a": 0, "b": T, "var": t, "label": "s", "units": "m"}
        elif case == 25:
            v = (2 + j) * sp.sin(t) + 3
            T = sp.pi
            W = sp.integrate(v, (t, 0, T))
            label = "s"
            prompt = f"Velocity \\(v(t)={expr_latex(v, t)}\\) m/s on \\([0,\\pi]\\). Find the distance traveled."
            setup = f"\\[s=\\int_0^{{\\pi}}({expr_latex(v, t)})\\,dt\\]"
            vp = {"method": "area", "xMin": 0, "xMax": 3.1416, "bottom": {"t": "c", "v": 0}, "top": {"t": "sin", "a": 2 + j, "b": 3}}
            compute = {"expr": v, "a": 0, "b": T, "var": t, "label": "s", "units": "m"}
        elif case == 26:
            rate, T = 4 + 2 * j, 4 + 2 * tier
            f = rate * (1 + t / T)
            W = sp.integrate(f, (t, 0, T))
            label = "Q"
            prompt = f"Flow rate is \\({expr_latex(f, t)}\\) L/min for \\(0\\le t\\le {T}\\). Find total volume delivered."
            setup = f"\\[Q=\\int_0^{{{T}}}{expr_latex(f, t)}\\,dt\\]"
            vp = {"method": "area", "xMin": 0, "xMax": T, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": rate / T, "b": rate}}
            compute = {"expr": f, "a": 0, "b": T, "var": t, "label": "Q"}
        elif case == 27:
            rate, T = 5 + j, 3 + tier
            f = rate * sp.exp(-t / T)
            W = sp.integrate(f, (t, 0, T))
            label = "Q"
            prompt = f"Flow rate \\({expr_latex(f, t)}\\) L/min on \\([0,{T}]\\). Find total volume."
            setup = f"\\[Q=\\int_0^{{{T}}}{expr_latex(f, t)}\\,dt\\]"
            vp = {"method": "area", "xMin": 0, "xMax": T, "bottom": {"t": "c", "v": 0}, "top": {"t": "exp", "s": rate, "a": -1 / T}}
            compute = {"expr": f, "a": 0, "b": T, "var": t, "label": "Q"}
        elif case == 28:
            c, T = 2 + j, 3 + tier + rep
            P = c * t**2
            W = sp.integrate(P, (t, 0, T))
            label = "E"
            prompt = f"Power draw is \\(P(t)={expr_latex(P, t)}\\) watts for \\(0\\le t\\le {T}\\). Find energy used."
            setup = f"\\[E=\\int_0^{{{T}}}{expr_latex(P, t)}\\,dt\\]"
            vp = {"method": "area", "xMin": 0, "xMax": T, "bottom": {"t": "c", "v": 0}, "top": {"t": "poly", "k": [0, 0, c]}}
            compute = {"expr": P, "a": 0, "b": T, "var": t, "label": "E", "units": "J"}
        elif case == 29:
            c, T = 3 + j, 2 + tier
            P = c * t**2 + (1 + rep) * t
            W = sp.integrate(P, (t, 0, T))
            label = "E"
            prompt = f"Power \\(P(t)={expr_latex(P, t)}\\) W on \\([0,{T}]\\). Find energy used."
            setup = f"\\[E=\\int_0^{{{T}}}{expr_latex(P, t)}\\,dt\\]"
            vp = {"method": "area", "xMin": 0, "xMax": T, "bottom": {"t": "c", "v": 0}, "top": {"t": "poly", "k": [0, 1 + rep, c]}}
            compute = {"expr": P, "a": 0, "b": T, "var": t, "label": "E", "units": "J"}
        elif case == 30:
            p, q, T = 60 + 20 * j, 3 + tier, 4 + tier
            Mp = p - q * x
            W = sp.integrate(Mp, (x, 0, T))
            label = "\\Delta P"
            prompt = f"Marginal profit is \\(P'(x)={expr_latex(Mp)}\\) dollars/unit for \\(0\\le x\\le {T}\\). Find total profit change."
            setup = f"\\[\\Delta P=\\int_0^{{{T}}}({expr_latex(Mp)})\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": T, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": -q, "b": p}}
            compute = {"expr": Mp, "a": 0, "b": T, "label": "\\Delta P"}
        elif case == 31:
            c, T = 80 + 20 * j, 1 + tier + rep
            rate = c * sp.exp(-t)
            W = sp.integrate(rate, (t, 0, T))
            label = "A"
            prompt = f"A drug concentration rate is \\({expr_latex(rate, t)}\\) units/hour on \\([0,{T}]\\). Find accumulated amount."
            setup = f"\\[A=\\int_0^{{{T}}}{expr_latex(rate, t)}\\,dt\\]"
            vp = {"method": "area", "xMin": 0, "xMax": T, "bottom": {"t": "c", "v": 0}, "top": {"t": "exp", "s": c, "a": -1}}
            compute = {"expr": rate, "a": 0, "b": T, "var": t, "label": "A"}

        # --- Geometry / mixed applications (32–35) ---
        elif case == 32:
            length, width, path = 16 + 4 * j, 10 + 2 * j, 1 + tier
            W = length * width - (length - 2 * path) * (width - 2 * path)
            label = "A"
            prompt = (
                f"A rectangular lot is \\({length}\\) m by \\({width}\\) m. A uniform walkway "
                f"\\({path}\\) m wide runs inside all four sides. Find the walkway area."
            )
            setup = f"\\[A_{{\\text{{walk}}}}={length}\\cdot{width}-({length}-2\\cdot{path})({width}-2\\cdot{path})\\]"
            vp = {"method": "area", "xMin": 0, "xMax": length, "bottom": {"t": "c", "v": 0}, "top": {"t": "c", "v": width}}
            steps = [
                step("Strategy: outer rectangle minus inner rectangle", "Walkway area = whole lot − unpaved interior."),
                step("Outer area", f"\\[A_{{\\text{{outer}}}}={length}\\cdot{width}={length * width}\\]"),
                step(
                    "Inner dimensions",
                    f"Inner size is \\(({length}-2\\cdot{path})\\times({width}-2\\cdot{path})"
                    f"=({length - 2 * path})\\times({width - 2 * path})\\).",
                ),
                step("Subtract", f"\\[A_{{\\text{{walk}}}}={length * width}-{(length - 2 * path) * (width - 2 * path)}={W}\\]"),
            ]
            out.append({
                "source": source, "title": "Applications", "prompt": prompt,
                "choices": mc_choices(f"A = {W}", f"2({W})", f"{W}/2", f"{length * width}"),
                "steps": steps, "finalAnswer": f"A = {W}",
                "insight": units_insight, "visual": "area", "difficulty": diff, "visualParams": vp,
                "equations": [r"A_{\text{walk}}=A_{\text{outer}}-A_{\text{inner}}"],
            })
            continue
        elif case == 33:
            base1, base2, height = 12 + 4 * j, 8 + 2 * j, 5 + tier + rep
            W = sp.Rational(base1 + base2, 2) * height
            label = "A"
            prompt = (
                f"A trapezoidal land lot has parallel sides \\({base1}\\) m and \\({base2}\\) m "
                f"with distance \\({height}\\) m between them. Find its area."
            )
            setup = f"\\[A=\\frac{{1}}{{2}}({base1}+{base2})({height})\\]"
            vp = {
                "method": "area", "xMin": 0, "xMax": height, "bottom": {"t": "c", "v": 0},
                "top": {"t": "lin", "a": (base2 - base1) / height, "b": base1},
            }
            steps = [
                step("Strategy: trapezoid area formula", "Average the two parallel sides, then multiply by the height."),
                step("Write the formula", f"\\[A=\\frac{{1}}{{2}}({base1}+{base2})({height})\\]"),
                step("Simplify", f"\\[A={nice_latex(W)}\\]"),
            ]
            out.append({
                "source": source, "title": "Applications", "prompt": prompt,
                "choices": mc_choices(f"A = {nice_latex(W)}", f"2({nice_latex(W)})", f"{base1 * height}", f"{base2 * height}"),
                "steps": steps, "finalAnswer": f"A = {nice_latex(W)}",
                "insight": units_insight, "visual": "area", "difficulty": diff, "visualParams": vp,
                "equations": [r"A=\frac{1}{2}(b_1+b_2)h"],
            })
            continue
        elif case == 34:
            c, T = 50 + 10 * j, 2 + tier
            rate = c * t * sp.exp(-t)
            W = sp.integrate(rate, (t, 0, T))
            label = "A"
            prompt = f"Infusion rate \\({expr_latex(rate, t)}\\) units/h on \\([0,{T}]\\). Find total accumulated amount."
            setup = f"\\[A=\\int_0^{{{T}}}{expr_latex(rate, t)}\\,dt\\]"
            vp = {"method": "area", "xMin": 0, "xMax": T, "bottom": {"t": "c", "v": 0}, "top": {"t": "exp", "s": c, "a": -1}}
            compute = {"expr": rate, "a": 0, "b": T, "var": t, "label": "A"}
        elif case == 35:
            # net change of a quantity from rate r(t)
            r = (6 + j) - (1 + rep) * t
            T = 4 + tier
            W = sp.integrate(r, (t, 0, T))
            label = "\\Delta Q"
            prompt = f"A quantity changes at rate \\(r(t)={expr_latex(r, t)}\\) on \\([0,{T}]\\). Find the net change."
            setup = f"\\[\\Delta Q=\\int_0^{{{T}}}({expr_latex(r, t)})\\,dt\\]"
            vp = {"method": "area", "xMin": 0, "xMax": T, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": -(1 + rep), "b": 6 + j}}
            compute = {"expr": r, "a": 0, "b": T, "var": t, "label": "\\Delta Q"}

        # --- Extra work variants (36–39) ---
        elif case == 36:
            F = (12 + j) / (x + 1)
            d = 3 + tier
            W = sp.integrate(F, (x, 0, d))
            prompt = f"Force \\(F(x)={expr_latex(F)}\\) N acts from \\(x=0\\) to \\(x={d}\\). Find the work."
            setup = f"\\[W=\\int_0^{{{d}}}{expr_latex(F)}\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": d, "bottom": {"t": "c", "v": 0}, "top": {"t": "recip", "a": 12 + j}}
            compute = {"expr": F, "a": 0, "b": d, "label": "W", "units": "J"}
        elif case == 37:
            # leaky sandbag: mass decreases linearly while lifted height H
            m0, H = 20 + 5 * j, 5 + tier
            # weight = (m0 g)(1 - y/H) if all sand gone at top; use g=9.8 ≈ 10 for clean numbers
            g = 10
            W = sp.integrate(m0 * g * (1 - y / H), (y, 0, H))
            prompt = (
                f"A bag starts at weight \\({m0 * g}\\) N and leaks sand uniformly so it is empty after rising "
                f"\\({H}\\) m. Find the work to lift it that height."
            )
            setup = f"\\[W=\\int_0^{{{H}}}{m0 * g}\\left(1-\\frac{{y}}{{{H}}}\\right)\\,dy\\]"
            vp = {"method": "area", "xMin": 0, "xMax": H, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": -m0 * g / H, "b": m0 * g}}
            compute = {
                "expr": m0 * g * (1 - y / H), "a": 0, "b": H, "var": y, "label": "W", "units": "J",
            }
        elif case == 38:
            # work against gravity for rocket-ish: F = c/(x+R)^2 style but keep elementary
            c, lo, hi = 100 + 20 * j, 1, 2 + tier
            F = c / x**2
            W = sp.integrate(F, (x, lo, hi))
            prompt = (
                f"A force \\(F(x)=\\dfrac{{{c}}}{{x^2}}\\) N acts from \\(x={lo}\\) to \\(x={hi}\\). Find the work."
            )
            setup = f"\\[W=\\int_{{{lo}}}^{{{hi}}}\\frac{{{c}}}{{x^2}}\\,dx\\]"
            vp = {"method": "area", "xMin": lo, "xMax": hi, "bottom": {"t": "c", "v": 0}, "top": {"t": "recip", "a": c}}
            compute = {"expr": F, "a": lo, "b": hi, "label": "W", "units": "J"}
        elif case == 39:
            # constant force then variable: work of F = kx + F0 (preload)
            k, F0, d = 30 + 10 * j, 20 + 5 * tier, sp.Rational(1, 2) + sp.Rational(rep, 4)
            F = F0 + k * x
            W = sp.integrate(F, (x, 0, d))
            prompt = (
                f"A loaded spring has restoring force \\(F(x)={F0}+{k}x\\) N. "
                f"Find the work to stretch it \\({sp.latex(d)}\\) m from the loaded equilibrium."
            )
            setup = f"\\[W=\\int_0^{{{sp.latex(d)}}}({F0}+{k}x)\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": float(d), "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": k, "b": F0}}
            compute = {"expr": F, "a": 0, "b": d, "label": "W", "units": "J"}
        # --- Modeling and decision applications (40–47) ---
        elif case == 40:
            # Hydrostatic force on a dam with a nonconstant width.
            H = 6 + tier
            width = 2 + y / 2
            pressure = 9800 * (H - y)
            F = sp.integrate(pressure * width, (y, 0, H))
            W = F
            label = "F"
            prompt = (
                f"A dam is {H} m high. At height y above the bottom its width is "
                f"\(w(y)=2+\\frac{{y}}{{2}}\) m. Water reaches the top. Using \(\\rho g=9800\), "
                "find the total hydrostatic force on the dam."
            )
            setup = f"\\[F=9800\\int_0^{{{H}}}(2+\\frac{{y}}{{2}})({H}-y)\\,dy\\]"
            vp = {"method": "area", "xMin": 0, "xMax": H, "bottom": {"t": "c", "v": 0}, "top": {"t": "poly", "k": [2 * H * 9800, (H / 2 - 2) * 9800, -9800 / 2]}}
            compute = {"expr": pressure * width, "a": 0, "b": H, "var": y, "label": "F", "units": "N"}
        elif case == 41:
            # Variable-density rod: mass is an accumulation, not a force/work problem.
            L = 4 + tier
            density = 2 + x
            mass = sp.integrate(density, (x, 0, L))
            W = mass
            label = "M"
            prompt = f"A {L} m rod has linear density \(\\rho(x)=2+x\) kg/m. Find its mass."
            setup = f"\\[M=\\int_0^{{{L}}}(2+x)\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": L, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": 1, "b": 2}}
            compute = {"expr": density, "a": 0, "b": L, "label": "M", "units": "kg"}
        elif case == 42:
            # Average value: the integral must be divided by the time interval.
            T = 12
            temp = 20 + (4 + tier) * sp.cos(sp.pi * t / T)
            avg = sp.simplify(sp.integrate(temp, (t, 0, T)) / T)
            W = avg
            label = "T_{\\mathrm{avg}}"
            prompt = f"A sensor records temperature \(T(t)=20+{4 + tier}\\cos(\\frac{{\\pi t}}{{12}})\) °C for \(0\\le t\\le12\). Find the average temperature."
            setup = f"\\[T_{{\\mathrm{{avg}}}}=\\frac{{1}}{{12}}\\int_0^{{12}}T(t)\\,dt\\]"
            vp = {"method": "area", "xMin": 0, "xMax": T, "bottom": {"t": "c", "v": 0}, "top": {"t": "cos", "a": 4 + tier, "w": sp.pi / T, "b": 20}}
            compute = {"expr": temp / T, "a": 0, "b": T, "var": t, "label": label, "units": "°C"}
        elif case == 43:
            # Population rate with a changing sign: net change is not total change.
            T = 8
            rate = 6 - 1.5 * t
            change = sp.integrate(rate, (t, 0, T))
            W = change
            label = "\\Delta P"
            prompt = f"A population changes at rate \(P'(t)=6-1.5t\) people/month for \(0\\le t\\le{T}\). Find the net change in population."
            setup = f"\\[\\Delta P=\\int_0^{{{T}}}(6-1.5t)\\,dt\\]"
            vp = {"method": "area", "xMin": 0, "xMax": T, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": -1.5, "b": 6}}
            compute = {"expr": rate, "a": 0, "b": T, "var": t, "label": label, "units": "people"}
        elif case == 44:
            # A finite-horizon decay model asks for accumulated exposure, not
            # the instantaneous rate at the endpoint.
            T = 3 + tier
            rate = (12 + 2 * tier) * sp.exp(-t / 2)
            total = sp.integrate(rate, (t, 0, T))
            W = total
            label = "Q"
            prompt = f"A sensor receives signal at rate \(r(t)={expr_latex(rate, t)}\) units/h for \(0\\le t\\le{T}\). Find the total signal received."
            setup = f"\\[Q=\\int_0^{{{T}}}{expr_latex(rate, t)}\\,dt\\]"
            vp = {"method": "area", "xMin": 0, "xMax": T, "bottom": {"t": "c", "v": 0}, "top": {"t": "exp", "s": 12 + 2 * tier, "a": -0.5}}
            compute = {"expr": rate, "a": 0, "b": T, "var": t, "label": label, "units": "units"}
        elif case == 45:
            # Marginal revenue versus marginal cost: the meaningful integrand
            # is the difference, and it changes sign at the break-even output.
            T = 10
            net_rate = 24 - 3 * x
            change = sp.integrate(net_rate, (x, 0, T))
            W = change
            label = "\\Delta P"
            prompt = (
                "A firm's marginal revenue is \(R'(x)=30-2x\) dollars/unit and marginal cost is "
                "\(C'(x)=6+x\). Assuming profit change is zero at x=0, find the net profit change after 10 units."
            )
            setup = "\\[\\Delta P=\\int_0^{10}(R'(x)-C'(x))\\,dx=\\int_0^{10}(24-3x)\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": T, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": -3, "b": 24}}
            compute = {"expr": net_rate, "a": 0, "b": T, "label": label, "units": "dollars"}
        elif case == 46:
            # Lorenz curve / Gini index from the reference's inequality model.
            lorenz = x**2
            gini = sp.simplify(1 - 2 * sp.integrate(lorenz, (x, 0, 1)))
            W = gini
            label = "G"
            prompt = "A population has Lorenz curve \(L(x)=x^2\). Find its Gini index \(G=1-2\\int_0^1L(x)\\,dx\)."
            setup = "\\[G=1-2\\int_0^1x^2\\,dx\\]"
            vp = {"method": "area", "xMin": 0, "xMax": 1, "bottom": {"t": "c", "v": 0}, "top": {"t": "poly", "k": [0, 0, 1]}}
            compute = {"expr": 1 - 2 * lorenz, "a": 0, "b": 1, "label": label}
        else:
            # Center of mass of a variable-density rod.
            L = 4 + tier
            density = 2 + x
            mass = sp.integrate(density, (x, 0, L))
            center = sp.simplify(sp.integrate(x * density, (x, 0, L)) / mass)
            W = center
            visual_kind = "centroid"
            label = "\\bar{x}"
            prompt = f"A {L} m rod has density \(\\rho(x)=2+x\) kg/m. Find its center of mass measured from the left end."
            setup = f"\\[\\bar x=\\frac{{\\int_0^{{{L}}}x(2+x)\\,dx}}{{\\int_0^{{{L}}}(2+x)\\,dx}}\\]"
            vp = {"method": "centroid", "xMin": 0, "xMax": L, "bottom": {"t": "c", "v": 0}, "top": {"t": "lin", "a": 1, "b": 2}, "marker": {"x": float(center), "y": 1}}
            compute = {"expr": x * density / mass, "a": 0, "b": L, "label": label, "units": "m"}

        out.append(custom_problem(
            source, "Applications", prompt, f"{label} = {sp.latex(sp.simplify(W))}", setup, visual_kind, diff, vp,
            units_insight,
            compute=compute,
        ))
    return out


def centroid_from_top(f, a, b):
    A = sp.integrate(f, (x, a, b))
    xb = sp.simplify(sp.integrate(x * f, (x, a, b)) / A)
    yb = sp.simplify(sp.integrate(f**2 / 2, (x, a, b)) / A)
    return A, xb, yb


def catalog_centroids_varied():
    out = []
    for i in range(PER_TOPIC):
        case, j = i % 10, i // 10
        diff = ["easy", "medium", "hard"][i % 3]
        b, h = 3 + j, 2 + j
        source = f"OpenStax Vol. 1 §6.3 / Briggs §6.7 centroid variant {i + 1}"
        if case == 0:
            f, xmax, prompt = h, b, f"Find the centroid of the rectangle \\(0\\le x\\le {b}\\), \\(0\\le y\\le {h}\\)."
            top = {"t": "c", "v": h}
        elif case == 1:
            f, xmax, prompt = h * (1 - x / b), b, f"Find the centroid under \\(y={h}(1-x/{b})\\) on \\([0,{b}]\\)."
            top = {"t": "lin", "a": -h / b, "b": h}
        elif case == 2:
            f, xmax, prompt = h * x / b, b, f"Find the centroid under \\(y={h}x/{b}\\) on \\([0,{b}]\\)."
            top = {"t": "lin", "a": h / b}
        elif case == 3:
            f, xmax, prompt = h * (1 - (x / b) ** 2), b, f"Find the centroid under \\(y={h}(1-x^2/{b*b})\\) on \\([0,{b}]\\)."
            top = {"t": "poly", "k": [h, 0, -h / (b * b)]}
        elif case == 4:
            f, xmax, prompt = 1 + x**2, b, f"Find the centroid under \\(y=1+x^2\\) on \\([0,{b}]\\)."
            top = {"t": "poly", "k": [1, 0, 1]}
        elif case == 5:
            f, xmax, prompt = h * sp.sqrt(x), b, f"Find the centroid under \\(y={h}\\sqrt{{x}}\\) on \\([0,{b}]\\)."
            top = {"t": "sqrt", "a": h}
        elif case == 6:
            f, xmax, prompt = h + x, b, f"Find the centroid under \\(y={h}+x\\) on \\([0,{b}]\\)."
            top = {"t": "lin", "a": 1, "b": h}
        elif case == 7:
            f, xmax, prompt = h + x * (b - x), b, f"Find the centroid under \\(y={h}+x({b}-x)\\) on \\([0,{b}]\\)."
            top = {"t": "poly", "k": [h, b, -1]}
        elif case == 8:
            f, xmax, prompt = h + sp.sin(x), sp.pi, f"Find the centroid under \\(y={h}+\\sin x\\) on \\([0,\\pi]\\)."
            top = {"t": "sin", "a": 1, "b": h}
        else:
            f, xmax, prompt = h + sp.exp(-x), b, f"Find the centroid under \\(y={h}+e^{{-x}}\\) on \\([0,{b}]\\)."
            top = {"t": "exp", "s": 1, "a": -1, "b": h}
        _, xb, yb = centroid_from_top(f, 0, xmax)
        ans = f"\\left({sp.latex(xb)}, {sp.latex(yb)}\\right)"
        setup = "\\[\\bar x=\\frac{\\int x f(x)dx}{\\int f(x)dx},\\quad \\bar y=\\frac{\\int f(x)^2/2\\,dx}{\\int f(x)dx}\\]"
        vp = {"method": "area", "xMin": 0, "xMax": float(xmax), "bottom": {"t": "c", "v": 0}, "top": top, "marker": {"x": float(xb.evalf()), "y": float(yb.evalf())}}
        out.append(custom_problem(
            source, "Centroid", prompt, f"(\\bar x,\\bar y) = {ans}", setup, "centroid", diff, vp,
            "Centroid is the balance point of area. Compute area \\(A\\), then moments: \\(\\bar x=M_y/A\\), \\(\\bar y=M_x/A\\).",
            compute={"f": f, "a": 0, "b": xmax},
        ))
    return out


def catalog_arc_varied():
    """12 arc-length concepts, including curves described as x=g(y)."""
    out = []
    N_ARC = 12
    for i in range(PER_TOPIC):
        case = i % N_ARC
        diff = difficulty_for_index(i)
        tier = difficulty_tier(diff)
        rep = (i // 10) % 2
        source = f"OpenStax Vol. 1 §6.4 / Briggs §6.5 arc concept {case + 1}, item {i + 1}"
        compute = None
        if case == 0:
            # Single linear concept (only one of 10)
            m = 1 + tier + rep
            n = 2 + tier
            c = rep
            f_line = m * x + c
            L = n * sp.sqrt(1 + m**2)
            prompt = f"Find the arc length of \\(y={expr_latex(f_line)}\\) from \\(x=0\\) to \\(x={n}\\)."
            setup = f"\\[L=\\int_0^{{{n}}}\\sqrt{{1+{m}^2}}\\,dx\\]"
            top = {"t": "lin", "a": m, "b": c}
            x0, x1 = 0, n
            compute = {"f": f_line, "expr": sp.sqrt(1 + m**2), "a": 0, "b": n, "label": "L"}
        elif case == 1:
            # Classic y = (2/3) x^{3/2}
            k = 1 + tier + rep
            n = 1 + tier + rep
            L = sp.simplify(sp.integrate(sp.sqrt(1 + k * k * x), (x, 0, n)))
            prompt = f"Find the arc length of \\(y=\\frac{{{2 * k}}}{{3}}x^{{3/2}}\\) on \\([0,{n}]\\)."
            setup = f"\\[L=\\int_0^{{{n}}}\\sqrt{{1+{k * k}x}}\\,dx\\]"
            top = {"t": "pow-shift", "a": 2 * k / 3, "n": 1.5}
            x0, x1 = 0, n
            compute = {
                "f": sp.Rational(2 * k, 3) * x ** sp.Rational(3, 2),
                "expr": sp.sqrt(1 + k * k * x), "a": 0, "b": n, "label": "L",
            }
        elif case == 2:
            # Parabola y = x^2 / (2p) style — y = x^2/2 → √(1+x^2)
            p = 1 + tier  # y = x^2/(2p) has y' = x/p
            n = 1 + rep if tier < 2 else 2
            f = x**2 / (2 * p)
            integrand = sp.sqrt(1 + (x / p) ** 2)
            L = sp.simplify(sp.integrate(integrand, (x, 0, n)))
            prompt = f"Find the arc length of the parabola \\(y=\\dfrac{{x^2}}{{{2 * p}}}\\) on \\([0,{n}]\\)."
            setup = f"\\[L=\\int_0^{{{n}}}\\sqrt{{1+\\left(\\frac{{x}}{{{p}}}\\right)^2}}\\,dx\\]"
            top = {"t": "poly", "k": [0, 0, 1 / (2 * p)]}
            x0, x1 = 0, n
            compute = {"f": f, "expr": integrand, "a": 0, "b": n, "label": "L"}
        elif case == 3:
            # Quarter / semicircle arc
            R = 2 + tier + rep
            if tier == 0:
                # quarter circle from 0 to R
                L = sp.pi * R / 2
                prompt = f"Find the arc length of the quarter-circle \\(y=\\sqrt{{{R * R}-x^2}}\\) from \\(x=0\\) to \\(x={R}\\)."
                setup = f"\\[L=\\int_0^{{{R}}}\\frac{{{R}}}{{\\sqrt{{{R * R}-x^2}}}}\\,dx\\]"
                x0, x1 = 0, R
            else:
                L = sp.pi * R
                prompt = f"Find the arc length of the upper semicircle \\(y=\\sqrt{{{R * R}-x^2}}\\) from \\(x=-{R}\\) to \\(x={R}\\)."
                setup = f"\\[L=\\int_{{-{R}}}^{{{R}}}\\frac{{{R}}}{{\\sqrt{{{R * R}-x^2}}}}\\,dx\\]"
                x0, x1 = -R, R
            top = {"t": "circle-upper", "R": R, "cx": 0, "cy": 0}
            # Closed form evaluation (known geometry)
            steps = [
                step("Strategy: circle arc length", "For \\(y=\\sqrt{R^2-x^2}\\), \\(y'=-x/y\\) and \\(\\sqrt{1+(y')^2}=R/y\\)."),
                step("Write the integral", setup),
                step("Recognize the geometry", f"This integral is the central angle times radius. Here the angle is "
                     f"{'\\pi/2' if tier == 0 else '\\pi'} and \\(R={R}\\)."),
                step("Final length", f"\\[L={sp.latex(L)}\\]"),
            ]
            out.append({
                "source": source, "title": "Arc length", "prompt": prompt,
                "choices": mc_choices(f"L = {sp.latex(L)}", f"2({sp.latex(L)})", f"{sp.latex(L/2)}", f"{R}"),
                "steps": steps, "finalAnswer": f"L = {sp.latex(L)}",
                "insight": "Arc length = sum of tiny hypotenuses: differentiate first, then integrate \\(\\sqrt{1+(y')^2}\\).",
                "visual": "curve", "difficulty": diff,
                "visualParams": {"method": "arc", "xMin": float(x0), "xMax": float(x1), "bottom": {"t": "c", "v": 0}, "top": top},
                "equations": equations_kit("arc", setup),
            })
            continue
        elif case == 4:
            # y = ln x
            lo = 1
            hi = sp.E if tier == 0 else (sp.E ** (1 + rep) if tier == 1 else sp.Integer(4 + rep))
            f = sp.log(x)
            integrand = sp.sqrt(1 + 1 / x**2)
            L = sp.simplify(sp.integrate(integrand, (x, lo, hi)))
            prompt = f"Find the arc length of \\(y=\\ln x\\) on \\([{lo},{sp.latex(hi)}]\\)."
            setup = f"\\[L=\\int_{{{lo}}}^{{{sp.latex(hi)}}}\\sqrt{{1+\\frac{{1}}{{x^2}}}}\\,dx\\]"
            top = {"t": "log", "a": 1}
            x0, x1 = float(lo), float(sp.N(hi))
            compute = {"f": f, "expr": integrand, "a": lo, "b": hi, "label": "L", "value": L}
        elif case == 5:
            # y = e^{x/a} or e^x
            a = 1 + tier
            n = sp.Integer(1) if tier == 0 else (sp.log(2) if tier == 1 else sp.Integer(1 + rep))
            f = sp.exp(x / a)
            integrand = sp.sqrt(1 + sp.exp(2 * x / a) / a**2)
            L = sp.simplify(sp.integrate(integrand, (x, 0, n)))
            prompt = f"Find the arc length of \\(y=e^{{x/{a}}}\\) on \\([0,{sp.latex(n)}]\\)."
            setup = f"\\[L=\\int_0^{{{sp.latex(n)}}}\\sqrt{{1+\\frac{{1}}{{{a * a}}}e^{{2x/{a}}}}}\\,dx\\]"
            top = {"t": "exp", "s": 1, "a": 1 / a}
            x0, x1 = 0.0, float(sp.N(n))
            compute = {"f": f, "expr": integrand, "a": 0, "b": n, "label": "L", "value": L}
        elif case == 6:
            # Shifted power curve: y=(2/3)(x+1)^{3/2} → √(1+(y')²)=√(x+2) (no hyperbolics)
            k = 1 + tier + rep
            n = 1 + tier + rep
            f = sp.Rational(2 * k, 3) * (x + 1) ** sp.Rational(3, 2)
            integrand = sp.sqrt(k * k * (x + 1) + 1)
            # For k=1: y'=(x+1)^{1/2}, √(1+y'²)=√(x+2)
            if k == 1:
                integrand = sp.sqrt(x + 2)
            else:
                # y = (2k/3)(x+1)^{3/2}, y' = k√(x+1), √(1+k²(x+1))
                integrand = sp.sqrt(1 + k * k * (x + 1))
            L = sp.simplify(sp.integrate(integrand, (x, 0, n)))
            prompt = (
                f"Find the arc length of "
                f"\\(y=\\dfrac{{{2 * k}}}{{3}}(x+1)^{{3/2}}\\) on \\([0,{n}]\\)."
            )
            setup = f"\\[L=\\int_0^{{{n}}}\\sqrt{{1+{k * k}(x+1)}}\\,dx\\]"
            top = {"t": "pow-shift", "a": 2 * k / 3, "b": 1, "n": 1.5}
            x0, x1 = 0, n
            compute = {"f": f, "expr": integrand, "a": 0, "b": n, "label": "L"}
        elif case == 7:
            # Classic textbook: y = x^3/6 + 1/(2x)
            lo = 1
            hi = 2 + tier + rep
            f = x**3 / 6 + 1 / (2 * x)
            # y' = x^2/2 - 1/(2x^2); 1+(y')^2 = (x^2/2 + 1/(2x^2))^2
            integrand = sp.simplify(sp.sqrt(1 + sp.diff(f, x) ** 2))
            L = sp.simplify(sp.integrate(integrand, (x, lo, hi)))
            prompt = f"Find the arc length of \\(y=\\dfrac{{x^3}}{{6}}+\\dfrac{{1}}{{2x}}\\) on \\([{lo},{hi}]\\)."
            setup = (
                f"Compute \\(y'\\), simplify \\(\\sqrt{{1+(y')^2}}\\), then "
                f"\\[L=\\int_{{{lo}}}^{{{hi}}}\\sqrt{{1+(y')^2}}\\,dx\\]"
            )
            top = {"t": "poly", "k": [0, 0, 0, 1 / 6]}  # approximate visual
            x0, x1 = lo, hi
            compute = {"f": f, "expr": integrand, "a": lo, "b": hi, "label": "L"}
        elif case == 8:
            # Piecewise polyline (distinct concept)
            n = 2 + tier + rep
            m2 = 2 + tier
            L = sp.sqrt(2) + (n - 1) * sp.sqrt(1 + m2**2)
            prompt = (
                f"Find the length of the polyline made of \\(y=x\\) on \\([0,1]\\) and "
                f"\\(y={m2}x-{m2 - 1}\\) on \\([1,{n}]\\)."
            )
            setup = f"\\[L=\\int_0^1\\sqrt2\\,dx+\\int_1^{{{n}}}\\sqrt{{1+{m2}^2}}\\,dx\\]"
            top = {
                "t": "piecewise",
                "segments": [
                    {"min": 0, "max": 1, "curve": {"t": "lin", "a": 1}},
                    {"min": 1, "max": n, "curve": {"t": "lin", "a": m2, "b": 1 - m2}},
                ],
            }
            p1 = full_definite_eval_steps(sp.sqrt(2), 0, 1, x, label="L_1", scale=1)
            p2 = full_definite_eval_steps(sp.sqrt(1 + m2**2), 1, n, x, label="L_2", scale=1)
            out.append({
                "source": source, "title": "Arc length", "prompt": prompt,
                "choices": mc_choices(f"L = {sp.latex(sp.simplify(L))}", f"2L", f"L/2", f"{n}"),
                "steps": [
                    step("Strategy: split the polyline", "Each linear piece has constant slope — write a separate arc-length integral for each segment."),
                    step("Segment 1", "On \\([0,1]\\), \\(y=x\\) so \\(y'=1\\) and \\(\\sqrt{1+(y')^2}=\\sqrt{2}\\)."),
                ] + p1 + [
                    step("Segment 2", f"On \\([1,{n}]\\), slope is \\({m2}\\) so \\(\\sqrt{{1+{m2}^2}}\\)."),
                ] + p2 + [
                    step("Add the lengths", f"\\[L=L_1+L_2={sp.latex(sp.simplify(L))}\\]"),
                ],
                "finalAnswer": f"L = {sp.latex(sp.simplify(L))}",
                "insight": "Arc length = sum of tiny hypotenuses: differentiate first, then integrate \\(\\sqrt{1+(y')^2}\\).",
                "visual": "curve", "difficulty": diff,
                "visualParams": {"method": "arc", "xMin": 0, "xMax": float(n), "bottom": {"t": "c", "v": 0}, "top": top},
                "equations": equations_kit("arc", setup),
            })
            continue
        elif case == 10:
            # Horizontal-strip arc length, x = g(y), as in the inverse-form
            # arc-length exercises in Briggs §6.5.
            hi = 3 + tier
            g = sp.Rational(2, 3) * y ** sp.Rational(3, 2)
            integrand = sp.sqrt(1 + y)
            L = sp.simplify(sp.integrate(integrand, (y, 0, hi)))
            prompt = f"Use horizontal strips to find the arc length of \\(x=\\frac{{2}}{{3}}y^{{3/2}}\\) on \\([0,{hi}]\\)."
            setup = f"\\[L=\\int_0^{{{hi}}}\\sqrt{{1+\\left(\\frac{{dx}}{{dy}}\\right)^2}}\\,dy=\\int_0^{{{hi}}}\\sqrt{{1+y}}\\,dy\\]"
            vp = {
                "method": "arc", "orientation": "horizontal", "yMin": 0, "yMax": hi,
                "left": {"t": "pow", "a": 2 / 3, "n": 1.5},
                "right": {"t": "pow", "a": 2 / 3, "n": 1.5},
                "sampleLabel": "sample y", "measureLabel": "segment length",
            }
            compute = {"f": g, "expr": integrand, "a": 0, "b": hi, "var": y, "label": "L", "value": L}
            out.append(custom_problem(
                source, "Arc length", prompt, f"L = {sp.latex(L)}", setup, "curve", diff, vp,
                "For a horizontal description x=g(y), use ds=\\sqrt{1+(dx/dy)^2}\\,dy. The strip direction determines the variable.",
                compute=compute,
            ))
            continue
        elif case == 11:
            # A line described horizontally: a geometry check and a genuine
            # dy problem rather than another y=f(x) slope clone.
            y0, y1 = -3, 4
            slope = 2 + tier
            L = (y1 - y0) * sp.sqrt(1 + slope**2)
            prompt = f"Use horizontal strips to find the arc length of \\(x={slope}y-4\\) from \\(y={y0}\\) to \\(y={y1}\\)."
            setup = f"\\[L=\\int_{{{y0}}}^{{{y1}}}\\sqrt{{1+{slope}^2}}\\,dy\\]"
            line = {"t": "lin", "a": slope, "b": -4}
            vp = {
                "method": "arc", "orientation": "horizontal", "yMin": y0, "yMax": y1,
                "left": line, "right": line,
                "sampleLabel": "sample y", "measureLabel": "segment length",
            }
            compute = {"f": slope * y - 4, "expr": sp.sqrt(1 + slope**2), "a": y0, "b": y1, "var": y, "label": "L", "value": L}
            out.append(custom_problem(
                source, "Arc length", prompt, f"L = {sp.latex(L)}", setup, "curve", diff, vp,
                "The horizontal form is the same hypotenuse idea: dx=(dx/dy)dy, so integrate with respect to y.",
                compute=compute,
            ))
            continue
        else:
            # y = √x
            n = 1 + tier + rep
            f = sp.sqrt(x)
            integrand = sp.sqrt(1 + 1 / (4 * x))
            # avoid x=0 singularity: integrate [eps, n] or use known form from a>0
            lo = sp.Rational(1, 4) if tier == 0 else sp.Rational(1, 4 + rep)
            L = sp.simplify(sp.integrate(integrand, (x, lo, n + lo)))
            prompt = f"Find the arc length of \\(y=\\sqrt{{x}}\\) on \\([{sp.latex(lo)},{sp.latex(n + lo)}]\\)."
            setup = f"\\[L=\\int_{{{sp.latex(lo)}}}^{{{sp.latex(n + lo)}}}\\sqrt{{1+\\frac{{1}}{{4x}}}}\\,dx\\]"
            top = {"t": "sqrt", "a": 1}
            x0, x1 = float(lo), float(n + lo)
            compute = {"f": f, "expr": integrand, "a": lo, "b": n + lo, "label": "L"}
        vp = {"method": "arc", "xMin": float(x0), "xMax": float(x1), "bottom": {"t": "c", "v": 0}, "top": top}
        out.append(custom_problem(
            source, "Arc length", prompt, f"L = {sp.latex(sp.simplify(L))}", setup, "curve", diff, vp,
            "Arc length = sum of tiny hypotenuses: differentiate first, then integrate \\(\\sqrt{1+(y')^2}\\).",
            compute=compute,
        ))
    return out


def catalog_surface_varied():
    """12 surface-of-revolution concepts incl. about y-axis and x=g(y); 20/20/10 difficulty."""
    out = []
    N_SURF = 12
    for i in range(PER_TOPIC):
        case = i % N_SURF
        diff = difficulty_for_index(i)
        tier = difficulty_tier(diff)
        rep = (i // N_SURF) % 2
        source = f"OpenStax Vol. 1 §6.4 / Briggs §6.6 surface concept {case + 1}, item {i + 1}"
        n = 1 + tier + rep
        compute = None
        axis_y = 0
        axis_label = "y = 0"
        method = "surface-x"
        orientation = "vertical"
        x_min = 0.0
        if case == 0:
            # Cone from a single line (only one linear concept)
            m = 1 + tier
            c = 1 + rep
            f = m * x + c
            S = 2 * sp.pi * sp.sqrt(1 + m**2) * sp.integrate(f, (x, 0, n))
            prompt = f"Find the surface area when \\(y={expr_latex(f)}\\) on \\([0,{n}]\\) is revolved about the \\(x\\)-axis."
            setup = f"\\[S=2\\pi\\int_0^{{{n}}}({expr_latex(f)})\\sqrt{{1+{m}^2}}\\,dx\\]"
            top = {"t": "lin", "a": m, "b": c}
            compute = {"f": f, "expr": f * sp.sqrt(1 + m**2), "a": 0, "b": n, "label": "S", "scale": 2 * sp.pi}
        elif case == 1:
            # Sphere band from circle y = √(R²−x²)
            R = 2 + tier + rep
            lo = 0
            hi = R / 2 if tier else R  # half or full quarter band
            if tier == 0:
                hi = R
            f = sp.sqrt(R**2 - x**2)
            # S = 2π ∫ y √(1+(y')²) dx = 2π ∫ R dx on the interval
            S = 2 * sp.pi * R * (hi - lo)
            prompt = (
                f"Find the surface area when the arc \\(y=\\sqrt{{{R * R}-x^2}}\\) on "
                f"\\([{lo},{sp.latex(hi)}]\\) is revolved about the \\(x\\)-axis."
            )
            setup = f"\\[S=2\\pi\\int_{{{lo}}}^{{{sp.latex(hi)}}}\\sqrt{{{R * R}-x^2}}\\cdot\\frac{{{R}}}{{\\sqrt{{{R * R}-x^2}}}}\\,dx=2\\pi R\\int_{{{lo}}}^{{{sp.latex(hi)}}}1\\,dx\\]"
            top = {"t": "circle-upper", "R": R, "cx": 0, "cy": 0}
            compute = {"f": f, "expr": sp.Integer(R), "a": lo, "b": hi, "label": "S", "scale": 2 * sp.pi}
        elif case == 2:
            # Power curve y = (2/3)x^{3/2}
            k = 1 + tier + rep
            f = sp.Rational(2 * k, 3) * x ** sp.Rational(3, 2)
            integrand = f * sp.sqrt(1 + k * k * x)
            S = 2 * sp.pi * sp.integrate(integrand, (x, 0, n))
            prompt = f"Find the surface area when \\(y=\\frac{{{2 * k}}}{{3}}x^{{3/2}}\\) on \\([0,{n}]\\) is revolved about the \\(x\\)-axis."
            setup = f"\\[S=2\\pi\\int_0^{{{n}}}\\frac{{{2 * k}}}{{3}}x^{{3/2}}\\sqrt{{1+{k * k}x}}\\,dx\\]"
            top = {"t": "pow-shift", "a": 2 * k / 3, "n": 1.5}
            compute = {"f": f, "expr": integrand, "a": 0, "b": n, "label": "S", "scale": 2 * sp.pi}
        elif case == 3:
            # Parabola y = √x about x-axis
            a = 1 + tier
            f = a * sp.sqrt(x)
            integrand = f * sp.sqrt(1 + (a / (2 * sp.sqrt(x))) ** 2)
            lo = sp.Rational(1, 4)
            hi = lo + 1 + tier + rep
            S = 2 * sp.pi * sp.integrate(integrand, (x, lo, hi))
            prompt = f"Find the surface area when \\(y={expr_latex(f)}\\) on \\([{sp.latex(lo)},{sp.latex(hi)}]\\) is revolved about the \\(x\\)-axis."
            setup = f"\\[S=2\\pi\\int_{{{sp.latex(lo)}}}^{{{sp.latex(hi)}}}{expr_latex(f)}\\sqrt{{1+(y')^2}}\\,dx\\]"
            top = {"t": "sqrt", "a": a}
            n = hi  # for vp
            compute = {"f": f, "expr": integrand, "a": lo, "b": hi, "label": "S", "scale": 2 * sp.pi}
            x_min = float(lo)
        elif case == 4:
            # Exponential y = e^{x/a}
            a = 1 + tier
            hi = 1 if tier < 2 else sp.log(2)
            f = sp.exp(x / a)
            integrand = f * sp.sqrt(1 + sp.exp(2 * x / a) / a**2)
            S = 2 * sp.pi * sp.integrate(integrand, (x, 0, hi))
            prompt = f"Find the surface area when \\(y=e^{{x/{a}}}\\) on \\([0,{sp.latex(hi)}]\\) is revolved about the \\(x\\)-axis."
            setup = f"\\[S=2\\pi\\int_0^{{{sp.latex(hi)}}}e^{{x/{a}}}\\sqrt{{1+\\frac{{1}}{{{a * a}}}e^{{2x/{a}}}}}\\,dx\\]"
            top = {"t": "exp", "s": 1, "a": 1 / a}
            n = float(hi.evalf() if hasattr(hi, "evalf") else hi)
            compute = {"f": f, "expr": integrand, "a": 0, "b": hi, "label": "S", "scale": 2 * sp.pi}
        elif case == 5:
            # Cylinder: constant y
            c = 1 + tier + rep
            n = 2 + tier + rep
            S = 2 * sp.pi * c * n
            prompt = f"Find the surface area generated by rotating \\(y={c}\\) on \\([0,{n}]\\) about the \\(x\\)-axis."
            setup = f"\\[S=2\\pi\\int_0^{{{n}}}{c}\\sqrt{{1+0}}\\,dx=2\\pi({c})({n})\\]"
            top = {"t": "c", "v": c}
            steps = [
                step("Strategy: right circular cylinder side", "A horizontal line rotated about the \\(x\\)-axis is a cylinder of radius \\(c\\) and length \\(n\\)."),
                step("Circumference", f"\\[2\\pi r=2\\pi({c})\\]"),
                step("Slant / length of generator", f"Since \\(y'=0\\), slant factor is 1 and length is \\({n}\\)."),
                step("Multiply", f"\\[S=2\\pi({c})({n})={sp.latex(S)}\\]"),
            ]
            out.append({
                "source": source, "title": "Surface area", "prompt": prompt,
                "choices": mc_choices(f"S = {sp.latex(sp.simplify(S))}", f"2S", f"S/2", f"{c * n}"),
                "steps": steps, "finalAnswer": f"S = {sp.latex(sp.simplify(S))}",
                "insight": "Surface of revolution: each band has area \\(2\\pi\\times(\\text{radius})\\times(\\text{slant length } ds)\\).",
                "visual": "surface", "difficulty": diff,
                "visualParams": {"method": "surface-x", "xMin": 0, "xMax": float(n), "axisY": 0, "axisLabel": "y = 0", "bottom": {"t": "c", "v": 0}, "top": top},
                "equations": equations_kit("surface", setup),
            })
            continue
        elif case == 6:
            # About a parallel line y = axis
            m = 1 + tier
            axis = 3 + tier + rep
            f = m * x + 1
            # radius = axis - y (need axis > f on interval)
            n = 1
            radius = axis - f
            S = 2 * sp.pi * sp.sqrt(1 + m**2) * sp.integrate(radius, (x, 0, n))
            prompt = f"Find the surface area when \\(y={expr_latex(f)}\\) on \\([0,{n}]\\) is revolved about the line \\(y={axis}\\)."
            setup = f"Radius is \\({axis}-y\\): \\[S=2\\pi\\int_0^{{{n}}}({expr_latex(radius)})\\sqrt{{1+{m}^2}}\\,dx\\]"
            top = {"t": "lin", "a": m, "b": 1}
            axis_y = axis
            axis_label = f"y = {axis}"
            compute = {
                "f": f, "expr": radius * sp.sqrt(1 + m**2), "a": 0, "b": n, "label": "S", "scale": 2 * sp.pi,
                "parts": {"radius": expr_latex(radius)},
            }
        elif case == 7:
            # y = x^2 about x-axis (parabola surface)
            f = x**2
            hi = 1 if tier < 2 else sp.Rational(3, 2)
            integrand = f * sp.sqrt(1 + (2 * x) ** 2)
            S = 2 * sp.pi * sp.integrate(integrand, (x, 0, hi))
            prompt = f"Find the surface area when \\(y=x^2\\) on \\([0,{sp.latex(hi)}]\\) is revolved about the \\(x\\)-axis."
            setup = f"\\[S=2\\pi\\int_0^{{{sp.latex(hi)}}}x^2\\sqrt{{1+4x^2}}\\,dx\\]"
            top = {"t": "pow", "a": 1, "n": 2}
            n = float(hi)
            compute = {"f": f, "expr": integrand, "a": 0, "b": hi, "label": "S", "scale": 2 * sp.pi}
        elif case == 8:
            # Shifted power curve with constant offset
            k = 1 + tier
            c = 1 + rep
            f = c + sp.Rational(2 * k, 3) * x ** sp.Rational(3, 2)
            integrand = f * sp.sqrt(1 + k * k * x)
            S = 2 * sp.pi * sp.integrate(integrand, (x, 0, n))
            prompt = f"Find the surface area when \\(y={c}+\\frac{{{2 * k}}}{{3}}x^{{3/2}}\\) on \\([0,{n}]\\) is revolved about the \\(x\\)-axis."
            setup = f"\\[S=2\\pi\\int_0^{{{n}}}\\left({c}+\\frac{{{2 * k}}}{{3}}x^{{3/2}}\\right)\\sqrt{{1+{k * k}x}}\\,dx\\]"
            top = {"t": "pow-shift", "a": 2 * k / 3, "b": c, "n": 1.5}
            compute = {"f": f, "expr": integrand, "a": 0, "b": n, "label": "S", "scale": 2 * sp.pi}
        elif case == 9:
            # y = √(c - x) about x-axis — slant simplifies to elementary √(linear)
            c = 3 + tier + rep
            lo = 0
            hi = 1 + tier + rep
            f = sp.sqrt(c - x)
            integrand = sp.sqrt(4 * c - 4 * x + 1) / 2
            S = 2 * sp.pi * sp.integrate(integrand, (x, lo, hi))
            prompt = (
                f"Find the surface area when \\(y=\\sqrt{{{c}-x}}\\) on "
                f"\\([{lo},{hi}]\\) is revolved about the \\(x\\)-axis."
            )
            setup = (
                f"Simplify the slant factor first: "
                f"\\[S=2\\pi\\int_{{{lo}}}^{{{hi}}}\\sqrt{{{c}-x}}"
                f"\\cdot\\frac{{\\sqrt{{4({c}-x)+1}}}}{{2\\sqrt{{{c}-x}}}}\\,dx"
                f"=\\pi\\int_{{{lo}}}^{{{hi}}}\\sqrt{{{4 * c + 1}-4x}}\\,dx\\]"
            )
            top = {"t": "sqrt", "a": 1}
            n = hi
            compute = {
                "f": f,
                "expr": integrand,
                "a": lo,
                "b": hi,
                "label": "S",
                "scale": 2 * sp.pi,
                "setup_display": setup,
                "display_integrand": f"\\frac{{1}}{{2}}\\sqrt{{{4 * c + 1}-4x}}",
            }
        elif case == 10:
            # y = m x revolved about the y-axis (radius = x)
            m = 1 + tier
            n = 1 + tier + rep
            f = m * x
            # S = 2π ∫ x √(1+(y')^2) dx about y-axis
            slant = sp.sqrt(1 + m**2)
            integrand = x * slant
            S = 2 * sp.pi * sp.integrate(integrand, (x, 0, n))
            y_eq = "x" if m == 1 else f"{m}x"
            prompt = (
                f"Find the surface area when \\(y={y_eq}\\) on \\([0,{n}]\\) "
                f"is revolved about the \\(y\\)-axis."
            )
            setup = (
                f"About the \\(y\\)-axis the radius is \\(x\\) (not \\(y\\)): "
                f"\\[S=2\\pi\\int_0^{{{n}}}x\\sqrt{{1+{m}^2}}\\,dx\\]"
            )
            top = {"t": "lin", "a": m}
            method = "surface-y"
            axis_y = 0
            axis_label = "x = 0"
            compute = {
                "f": f, "expr": integrand, "a": 0, "b": n, "label": "S", "scale": 2 * sp.pi,
                "parts": {"radius": "x"},
                "display_integrand": f"x\\sqrt{{1+{m}^2}}",
                "setup_display": setup,
            }
        else:
            # x = g(y) revolved about the x-axis (horizontal): e.g. x = √y or x = (y+c)/m
            # S = 2π ∫ y √(1+(x')^2) dy
            c = 1 + rep
            m = 2 + tier  # x = (y + c)/m  ⇔  y = m x - c
            hi = m + c if tier else (1 + c)
            # Use x = 2√y (classic): y from 0 to n
            n_y = 1 + tier + rep
            g = 2 * sp.sqrt(y)  # x = 2√y
            # x' = 1/√y; √(1+(x')^2) = √(1 + 1/y) = √((y+1)/y)
            integrand = y * sp.sqrt(1 + (1 / sp.sqrt(y)) ** 2)
            # domain avoid y=0 singularity: [1/4, n_y+1/4]
            lo = sp.Rational(1, 4)
            hi = lo + n_y
            integrand = y * sp.sqrt(1 + 1 / y)
            S = 2 * sp.pi * sp.integrate(integrand, (y, lo, hi))
            prompt = (
                f"Find the surface area when \\(x=2\\sqrt{{y}}\\) on "
                f"\\(y\\in[{sp.latex(lo)},{sp.latex(hi)}]\\) is revolved about the \\(x\\)-axis."
            )
            setup = (
                f"With \\(x=g(y)\\) about the \\(x\\)-axis, radius is \\(y\\): "
                f"\\[S=2\\pi\\int_{{{sp.latex(lo)}}}^{{{sp.latex(hi)}}}y"
                f"\\sqrt{{1+\\big(g'(y)\\big)^2}}\\,dy"
                f"=2\\pi\\int_{{{sp.latex(lo)}}}^{{{sp.latex(hi)}}}y\\sqrt{{1+\\frac{{1}}{{y}}}}\\,dy\\]"
            )
            top = {"t": "pow", "a": 1 / 4, "n": 2}  # y = x^2/4
            method = "surface-y"
            orientation = "horizontal"
            n = float(hi)
            x_min = float(2 * sp.sqrt(lo))
            axis_label = "y = 0"
            compute = {
                "f": g, "expr": integrand, "a": lo, "b": hi, "var": y, "label": "S", "scale": 2 * sp.pi,
                "parts": {"radius": "y"},
                "display_integrand": "y\\sqrt{1+1/y}",
                "setup_display": setup,
            }
        vp = {
            "method": method,
            "orientation": orientation,
            "xMin": float(x_min),
            "xMax": float(n) if not isinstance(n, float) else n,
            "axisY": axis_y if method == "surface-x" else 0,
            "axisX": 0 if method == "surface-y" else None,
            "axisLabel": axis_label,
            "bottom": {"t": "c", "v": 0},
            "top": top,
        }
        if method == "surface-y" and orientation == "horizontal":
            vp["yMin"] = float(compute["a"]) if compute else 0
            vp["yMax"] = float(compute["b"]) if compute else n
            vp["left"] = {"t": "c", "v": 0}
            vp["right"] = {"t": "sqrt", "a": 2}
        # drop None keys
        vp = {k: v for k, v in vp.items() if v is not None}
        out.append(custom_problem(
            source, "Surface area", prompt, f"S = {sp.latex(sp.simplify(S))}", setup, "surface", diff, vp,
            "Surface of revolution: each band has area \\(2\\pi\\times(\\text{radius to the axis})\\times(\\text{slant length } ds)\\). Radius is \\(y\\) about the \\(x\\)-axis and \\(x\\) about the \\(y\\)-axis.",
            compute=compute,
        ))
    return out


def catalog_inertia_varied():
    out = []
    for i in range(PER_TOPIC):
        case, j = i % 14, i // 14
        diff = ["easy", "medium", "hard"][i % 3]
        b, h = 2 + j, 2 + j + case
        source = f"OpenStax Vol. 1 §6.6 / Briggs §6.7 inertia variant {i + 1}"
        if case == 0:
            f, xmax, prompt = h, b, f"Find \\(I_x\\) for a rectangle of base \\({b}\\) and height \\({h}\\)."
            top = {"t": "c", "v": h}
        elif case == 1:
            f, xmax, prompt = h * (1 - x / b), b, f"Find \\(I_x\\) for the triangle under \\(y={h}(1-x/{b})\\)."
            top = {"t": "lin", "a": -h / b, "b": h}
        elif case == 2:
            f, xmax, prompt = h * x / b, b, f"Find \\(I_x\\) for the triangle under \\(y={h}x/{b}\\)."
            top = {"t": "lin", "a": h / b}
        elif case == 3:
            f, xmax, prompt = h * (1 - (x / b) ** 2), b, f"Find \\(I_x\\) under \\(y={h}(1-x^2/{b*b})\\)."
            top = {"t": "poly", "k": [h, 0, -h / (b * b)]}
        elif case == 4:
            f, xmax, prompt = 1 + x, b, f"Find \\(I_x\\) under \\(y=1+x\\) on \\([0,{b}]\\)."
            top = {"t": "lin", "a": 1, "b": 1}
        elif case == 5:
            f, xmax, prompt = 1 + x**2, b, f"Find \\(I_x\\) under \\(y=1+x^2\\) on \\([0,{b}]\\)."
            top = {"t": "poly", "k": [1, 0, 1]}
        elif case == 6:
            f, xmax, prompt = h * sp.sqrt(x), b, f"Find \\(I_x\\) under \\(y={h}\\sqrt{{x}}\\) on \\([0,{b}]\\)."
            top = {"t": "sqrt", "a": h}
        elif case == 7:
            f, xmax, prompt = h + x * (b - x), b, f"Find \\(I_x\\) under \\(y={h}+x({b}-x)\\)."
            top = {"t": "poly", "k": [h, b, -1]}
        elif case == 8:
            f, xmax, prompt = h + sp.sin(x), sp.pi, f"Find \\(I_x\\) under \\(y={h}+\\sin x\\) on \\([0,\\pi]\\)."
            top = {"t": "sin", "a": 1, "b": h}
        else:
            f, xmax, prompt = h + sp.exp(-x), b, f"Find \\(I_x\\) under \\(y={h}+e^{{-x}}\\) on \\([0,{b}]\\)."
            top = {"t": "exp", "s": 1, "a": -1, "b": h}
        I = sp.integrate(f**3 / 3, (x, 0, xmax))
        setup = "\\[I_x=\\int_a^b\\frac{f(x)^3}{3}dx\\]"
        vp = {"method": "area", "xMin": 0, "xMax": float(xmax), "bottom": {"t": "c", "v": 0}, "top": top}
        out.append(custom_problem(
            source, "Moment of inertia", prompt, f"I_x = {sp.latex(sp.simplify(I))}", setup, "inertia", diff, vp,
            "Second moment weights each area piece by distance squared from the axis — far pieces matter more.",
            compute={
                "expr": f**3 / 3, "a": 0, "b": xmax, "label": "I_x", "f": f,
                "parts": {"f": expr_latex(f), "var": "x"},
                "display_integrand": f"\\frac{{({expr_latex(f)})^{{3}}}}{{3}}",
                "setup_display": f"\\[I_x=\\int_0^{{{sp.latex(xmax)}}}\\frac{{({expr_latex(f)})^{{3}}}}{{3}}\\,dx\\]",
            },
        ))
    return out


def catalog_fundamentals_conceptual():
    """10 distinct antiderivative concepts × 5 items = 50; difficulty by index (20/20/10)."""
    out = []
    for i in range(PER_TOPIC):
        case = i % 10
        diff = difficulty_for_index(i)
        tier = difficulty_tier(diff)
        # Secondary variation within the same difficulty band
        rep = (i // 10) % 2
        source = f"OpenStax Vol. 1 §4.10 / Briggs §4.9 antiderivative concept {case + 1}, item {i + 1}"
        if case == 0:
            # Power rule — hard uses fractional / negative powers
            if tier == 0:
                expr = (2 + rep) * x ** (1 + rep)
            elif tier == 1:
                expr = (3 + rep) * x ** sp.Rational(2 + rep, 3)
            else:
                expr = (4 + rep) * x ** sp.Rational(-2 - rep, 3) + (1 + rep) * x**4
            out.append(make_indefinite(expr, source, "Power-rule antiderivative", diff, "fundamentals", x))
        elif case == 1:
            if tier == 0:
                expr = x**3 - (2 + rep) * x + (3 + rep)
            elif tier == 1:
                expr = (2 + rep) * x**4 - 3 * x**2 + (5 + rep) * x - 1
            else:
                expr = (x**2 + 1) * (x - 2 - rep)  # expand first
            out.append(make_indefinite(expr, source, "Term-by-term antiderivative", diff, "fundamentals", x))
        elif case == 2:
            if tier == 0:
                expr = (2 + rep) * sp.cos(x) - sp.sin(x)
            elif tier == 1:
                expr = (3 + rep) * sp.sec(x) ** 2 - (1 + rep) * sp.csc(x) ** 2
            else:
                expr = sp.sin(x) * (sp.csc(x) - (2 + rep) * sp.cot(x))
            out.append(make_indefinite(expr, source, "Trigonometric antiderivative", diff, "fundamentals", x))
        elif case == 3:
            if tier == 0:
                expr = sp.exp(x) + (1 + rep) / x
            elif tier == 1:
                expr = (2 + rep) * sp.exp(x) - (3 + rep) / x + x
            else:
                expr = sp.exp(2 * x) / sp.exp(x) + (4 + rep) / x  # simplify e^x
            out.append(make_indefinite(expr, source, "Exponential and logarithmic antiderivative", diff, "fundamentals", x))
        elif case == 4:
            k = 1 + tier + rep
            if tier == 0:
                expr = 2 * x * (x**2 + k) ** 2
            elif tier == 1:
                expr = 3 * x**2 * (x**3 + k) ** 3
            else:
                expr = (2 * x + 1) * (x**2 + x + k) ** 4
            out.append(make_indefinite(expr, source, "Recognize a simple substitution", diff, "fundamentals", x))
        elif case == 5:
            if tier == 0:
                expr = (2 + rep) / sp.sqrt(1 - x**2)
            elif tier == 1:
                expr = (3 + rep) / sp.sqrt(4 - x**2)
            else:
                # arcsin of linear argument / scaled circle
                expr = (4 + rep) / sp.sqrt(9 - (x + 1) ** 2)
            out.append(make_indefinite(expr, source, "Inverse-trig pattern", diff, "fundamentals", x))
        elif case == 6:
            k = 1 + tier + rep
            if tier < 2:
                expr = k / (1 + (k * x) ** 2)
            else:
                expr = (2 * k) / (9 + 4 * x**2)
            out.append(make_indefinite(expr, source, "Arctangent pattern", diff, "fundamentals", x))
        elif case == 7:
            if tier == 0:
                expr = 3 * t**2 + (2 + rep) * t
                C0 = 5
            elif tier == 1:
                expr = 4 * t**3 - (1 + rep) * t + 2
                C0 = -3
            else:
                expr = sp.exp(t) - (2 + rep) * t
                C0 = 1
            F = sp.integrate(expr, t) + (C0 - sp.integrate(expr, t).subs(t, 0))
            F = sp.simplify(F)
            prompt = f"Given \\(F'(t)={expr_latex(expr, t)}\\) and \\(F(0)={C0}\\), find \\(F(t)\\)."
            ans = f"F(t) = {expr_latex(F, t)}"
            setup = f"\\[F(t)=\\int ({expr_latex(expr, t)})\\,dt+C,\\quad F(0)={C0}\\]"
            vp = infer_visual_params(expr, "fundamentals", 0, 2, t)
            out.append(custom_problem(
                source, "Initial value antiderivative", prompt, ans, setup, "area", diff, vp,
                f"{source} — antiderivative plus an initial condition fixes \\(C\\).",
            ))
        elif case == 8:
            if tier == 0:
                acc = (2 + rep) * t + 1
                v0 = 3
            elif tier == 1:
                acc = 6 * t - (2 + rep)
                v0 = -1
            else:
                acc = sp.sin(t) + (1 + rep)
                v0 = 2
            vel = sp.simplify(sp.integrate(acc, t) + (v0 - sp.integrate(acc, t).subs(t, 0)))
            prompt = f"An object has acceleration \\(a(t)={expr_latex(acc, t)}\\) and \\(v(0)={v0}\\). Find \\(v(t)\\)."
            ans = f"v(t) = {expr_latex(vel, t)}"
            setup = f"\\[v(t)=\\int({expr_latex(acc, t)})dt+C,\\quad v(0)={v0}\\]"
            vp = infer_visual_params(acc, "fundamentals", 0, 2, t)
            out.append(custom_problem(
                source, "Motion from acceleration", prompt, ans, setup, "area", diff, vp,
                f"{source} — integrate acceleration to velocity.",
            ))
        else:
            if tier == 0:
                expr, a0, b0 = (1 + rep) * x**2 + 1, 0, 2 + rep
            elif tier == 1:
                expr, a0, b0 = sp.sin(x) + (1 + rep) * x, 0, sp.pi / 2
            else:
                expr, a0, b0 = 1 / (1 + x**2) + x, 0, 1 + rep
            out.append(make_definite(expr, a0, b0, source, "Fundamental Theorem evaluation", diff, "area", x))
    return out[:PER_TOPIC]


def catalog_centroids_conceptual():
    out = []
    N_CENT = 14
    for i in range(PER_TOPIC):
        case = i % N_CENT
        diff = difficulty_for_index(i)
        tier = difficulty_tier(diff)
        rep = (i // N_CENT) % 2
        j = tier + rep
        b, h = 3 + j, 2 + j
        cutout = None
        parts = None
        source = f"OpenStax Vol. 1 §6.3 / Briggs §6.7 centroid concept {case + 1}, item {i + 1}"
        if case == 0:
            ans = f"\\left({frac_latex(sp.Rational(b, 2))},{frac_latex(sp.Rational(h, 2))}\\right)"
            prompt = f"Find the centroid of the rectangle \\(0\\le x\\le {b}\\), \\(0\\le y\\le {h}\\)."
            setup = "A rectangle balances at the midpoint of each side."
            marker = {"x": b / 2, "y": h / 2}
            top = {"t": "c", "v": h}
        elif case == 1:
            ans = f"\\left({frac_latex(sp.Rational(b, 3))},{frac_latex(sp.Rational(h, 3))}\\right)"
            prompt = f"Find the centroid of the right triangle with vertices \\((0,0),({b},0),(0,{h})\\)."
            setup = "\\[(\\bar x,\\bar y)=(b/3,h/3)\\] for this right-triangle orientation."
            marker = {"x": b / 3, "y": h / 3}
            top = {"t": "lin", "a": -h / b, "b": h}
        elif case == 2:
            ans = f"\\left({frac_latex(sp.Rational(2*b, 3))},{frac_latex(sp.Rational(h, 3))}\\right)"
            prompt = f"Find the centroid of the right triangle with vertices \\((0,0),({b},0),({b},{h})\\)."
            setup = "The right angle is at \\((b,0)\\), so \\(\\bar x=2b/3\\), \\(\\bar y=h/3\\)."
            marker = {"x": 2 * b / 3, "y": h / 3}
            top = {"t": "lin", "a": h / b}
        elif case == 3:
            f = h * (1 - (x / b) ** 2)
            _, xb, yb = centroid_from_top(f, 0, b)
            ans = f"\\left({sp.latex(xb)},{sp.latex(yb)}\\right)"
            prompt = f"Find the centroid of the parabolic region under \\(y={h}(1-x^2/{b*b})\\), \\(0\\le x\\le {b}\\)."
            setup = "\\[\\bar x=\\frac{\\int xf(x)dx}{A},\\quad \\bar y=\\frac{\\int f(x)^2/2\\,dx}{A}\\]"
            marker = {"x": float(xb.evalf()), "y": float(yb.evalf())}
            top = {"t": "poly", "k": [h, 0, -h / (b * b)]}
        elif case == 4:
            f = h * sp.sqrt(x)
            _, xb, yb = centroid_from_top(f, 0, b)
            ans = f"\\left({sp.latex(xb)},{sp.latex(yb)}\\right)"
            prompt = f"Find the centroid of the region under \\(y={h}\\sqrt{{x}}\\), \\(0\\le x\\le {b}\\)."
            setup = "\\[A=\\int f(x)dx,\\quad \\bar x=M_y/A,\\quad \\bar y=M_x/A\\]"
            marker = {"x": float(xb.evalf()), "y": float(yb.evalf())}
            top = {"t": "sqrt", "a": h}
        elif case == 5:
            # Composite L-shape = big rectangle minus upper-right cutout.
            # Visual must be the actual L (piecewise top), not a full rectangle.
            cutw, cuth = 1 + j, 1 + j
            # Ensure cutout fits strictly inside the rectangle.
            cutw = min(cutw, b - 1)
            cuth = min(cuth, h - 1)
            if cutw < 1:
                cutw = 1
            if cuth < 1:
                cuth = 1
            A1, x1, y1 = b * h, sp.Rational(b, 2), sp.Rational(h, 2)
            A2, x2, y2 = cutw * cuth, b - sp.Rational(cutw, 2), h - sp.Rational(cuth, 2)
            A = A1 - A2
            xb = sp.simplify((A1 * x1 - A2 * x2) / A)
            yb = sp.simplify((A1 * y1 - A2 * y2) / A)
            ans = f"\\left({sp.latex(xb)},{sp.latex(yb)}\\right)"
            prompt = f"A \\({b}\\times {h}\\) rectangle has a \\({cutw}\\times {cuth}\\) rectangle removed from the upper-right corner. Find the centroid."
            setup = "\\[\\bar x=\\frac{A_1x_1-A_2x_2}{A_1-A_2},\\quad \\bar y=\\frac{A_1y_1-A_2y_2}{A_1-A_2}\\]"
            marker = {"x": float(xb.evalf()), "y": float(yb.evalf())}
            # L-profile: full height on [0, b-cutw], reduced height on [b-cutw, b].
            split = float(b - cutw)
            top = {
                "t": "piecewise",
                "segments": [
                    {"min": 0, "max": split, "curve": {"t": "c", "v": float(h)}},
                    {"min": split, "max": float(b), "curve": {"t": "c", "v": float(h - cuth)}},
                ],
            }
            # Metadata for the animation: ghost of the removed piece + component centroids.
            cutout = {
                "xMin": float(b - cutw),
                "yMin": float(h - cuth),
                "xMax": float(b),
                "yMax": float(h),
            }
            parts = [
                {"x": float(x1), "y": float(y1), "role": "keep", "label": "A1"},
                {"x": float(x2), "y": float(y2), "role": "remove", "label": "A2"},
            ]
        elif case == 6:
            f = h + x
            _, xb, yb = centroid_from_top(f, 0, b)
            ans = f"\\bar x = {sp.latex(xb)}"
            prompt = f"Find only \\(\\bar x\\) for the region under \\(y={h}+x\\), \\(0\\le x\\le {b}\\)."
            setup = "\\[\\bar x=\\frac{\\int xf(x)dx}{\\int f(x)dx}\\]"
            marker = {"x": float(xb.evalf()), "y": float(yb.evalf())}
            top = {"t": "lin", "a": 1, "b": h}
        elif case == 7:
            f = h + x
            _, xb, yb = centroid_from_top(f, 0, b)
            ans = f"\\bar y = {sp.latex(yb)}"
            prompt = f"Find only \\(\\bar y\\) for the region under \\(y={h}+x\\), \\(0\\le x\\le {b}\\)."
            setup = "\\[\\bar y=\\frac{\\int f(x)^2/2\\,dx}{\\int f(x)dx}\\]"
            marker = {"x": float(xb.evalf()), "y": float(yb.evalf())}
            top = {"t": "lin", "a": 1, "b": h}
        elif case == 8:
            f = h + sp.sin(x)
            _, xb, yb = centroid_from_top(f, 0, sp.pi)
            ans = f"\\left({sp.latex(xb)},{sp.latex(yb)}\\right)"
            prompt = f"Use symmetry/moments to find the centroid under \\(y={h}+\\sin x\\) on \\([0,\\pi]\\)."
            setup = "Use symmetry for \\(\\bar x\\), then compute \\(\\bar y=M_x/A\\)."
            marker = {"x": float(xb.evalf()), "y": float(yb.evalf())}
            top = {"t": "sin", "a": 1, "b": h}
            b = sp.pi
        elif case == 9:
            f = h + sp.exp(-x)
            _, xb, yb = centroid_from_top(f, 0, b)
            ans = f"\\left({sp.latex(xb)},{sp.latex(yb)}\\right)"
            prompt = f"Find the centroid under \\(y={h}+e^{{-x}}\\), \\(0\\le x\\le {b}\\)."
            setup = "\\[\\bar x=M_y/A,\\quad \\bar y=M_x/A\\]"
            marker = {"x": float(xb.evalf()), "y": float(yb.evalf())}
            top = {"t": "exp", "s": 1, "a": -1, "b": h}
        elif case == 10:
            R = 2 + j
            xb = sp.Integer(0)
            yb = sp.Rational(4 * R, 3) / sp.pi
            ans = f"\\left(0,{sp.latex(yb)}\\right)"
            prompt = f"Find the centroid of the upper semicircular lamina \\(x^2+y^2\\le {R*R}\\), \\(y\\ge0\\)."
            setup = "\\[\\bar x=0\\text{ by symmetry},\\quad \\bar y=\\frac{4R}{3\\pi}\\]"
            marker = {"x": 0, "y": float(yb.evalf())}
            top = {"t": "circle-upper", "R": R, "cx": 0, "cy": 0}
            b = R
            x_min = -R
        elif case == 11:
            R = 2 + j
            xb = sp.Rational(4 * R, 3) / sp.pi
            yb = xb
            ans = f"\\left({sp.latex(xb)},{sp.latex(yb)}\\right)"
            prompt = f"Find the centroid of the quarter-circular lamina of radius \\({R}\\) in the first quadrant."
            setup = "\\[\\bar x=\\bar y=\\frac{4R}{3\\pi}\\]"
            marker = {"x": float(xb.evalf()), "y": float(yb.evalf())}
            top = {"t": "circle-upper", "R": R, "cx": 0, "cy": 0}
            b = R
            x_min = 0
        elif case == 12:
            base1, base2, height = 4 + j, 2 + j, 3 + j
            f = base1 + (base2 - base1) * x / height
            _, xb, yb = centroid_from_top(f, 0, height)
            ans = f"\\left({sp.latex(xb)},{sp.latex(yb)}\\right)"
            prompt = f"Find the centroid of a trapezoidal lamina with vertical parallel sides \\({base1}\\) and \\({base2}\\), separated by \\({height}\\)."
            setup = "Model the trapezoid as the region under a linear top edge, then use \\(\\bar x=M_y/A\\), \\(\\bar y=M_x/A\\)."
            marker = {"x": float(xb.evalf()), "y": float(yb.evalf())}
            top = {"t": "lin", "a": (base2 - base1) / height, "b": base1}
            b = height
            x_min = 0
        else:
            # Horizontal strips: region between x = y^2 and x = c
            hi = 2 + j
            c = hi * hi
            width = c - y**2
            A = sp.integrate(width, (y, 0, hi))
            # M_x = ∫ y * width dy; M_y = ∫ (1/2)(right^2 - left^2) dy
            Mx = sp.integrate(y * width, (y, 0, hi))
            My = sp.integrate((c**2 - (y**2) ** 2) / 2, (y, 0, hi))
            xb = sp.simplify(My / A)
            yb = sp.simplify(Mx / A)
            ans = f"\\left({sp.latex(xb)},{sp.latex(yb)}\\right)"
            prompt = (
                f"Use horizontal strips to find the centroid of the region bounded by "
                f"\\(x=y^2\\), \\(x={c}\\), and \\(y=0\\)."
            )
            setup = (
                f"\\[A=\\int_0^{{{hi}}}({c}-y^2)\\,dy,\\quad"
                f"\\bar y=\\frac{{1}}{{A}}\\int_0^{{{hi}}}y({c}-y^2)\\,dy,\\quad"
                f"\\bar x=\\frac{{1}}{{A}}\\int_0^{{{hi}}}\\frac{{1}}{{2}}\\big(({c})^2-(y^2)^2\\big)\\,dy\\]"
            )
            marker = {"x": float(xb.evalf()), "y": float(yb.evalf())}
            top = {"t": "sqrt", "a": 1}
            b = c
            x_min = 0
            f = None  # handled with special compute below
            compute_h = {
                "expr": width, "a": 0, "b": hi, "var": y, "label": "A",
                "parts": {"right": str(c), "left": "y^{2}", "var": "y", "orientation": "horizontal"},
            }
        if "x_min" not in locals():
            x_min = 0
        # method "centroid" drives strip geometry + balance narration in the visualizer.
        vp = {
            "method": "centroid",
            "orientation": "horizontal" if case == 13 else "vertical",
            "xMin": float(x_min),
            "xMax": float(b),
            "bottom": {"t": "c", "v": 0},
            "top": top,
            "marker": marker,
            "sampleLabel": "sample y" if case == 13 else "sample x",
            "measureLabel": "strip length" if case == 13 else "strip height",
        }
        if case == 13:
            vp["yMin"] = 0
            vp["yMax"] = float(hi)
            vp["left"] = {"t": "pow", "a": 1, "n": 2}
            vp["right"] = {"t": "c", "v": c}
        if cutout is not None:
            vp["cutout"] = cutout
        if parts is not None:
            vp["parts"] = parts
        # Full moment work when we have a height function f (integral cases only)
        compute = None
        f_local = locals().get("f")
        if case == 13:
            # Custom horizontal-strip centroid solution
            steps = [
                step(
                    "Strategy: horizontal strips",
                    "Integrate with respect to \\(y\\). Strip length is right − left; moments use the strip’s mid-\\(x\\) and height \\(y\\).",
                ),
                step("Area", f"\\[A=\\int_0^{{{hi}}}({c}-y^2)\\,dy={nice_latex(A)}\\]"),
                step("Moment for \\(\\bar y\\)", f"\\[M_x=\\int_0^{{{hi}}}y({c}-y^2)\\,dy={nice_latex(Mx)}\\]"),
                step("Moment for \\(\\bar x\\)", f"\\[M_y=\\int_0^{{{hi}}}\\frac12\\big(({c})^2-(y^2)^2\\big)\\,dy={nice_latex(My)}\\]"),
                step("Centroid", f"\\[\\bar x=M_y/A={sp.latex(xb)},\\quad\\bar y=M_x/A={sp.latex(yb)}\\]"),
                step("Final", f"\\[(\\bar x,\\bar y)={ans}\\]"),
            ]
            out.append({
                "source": source, "title": "Centroid", "prompt": prompt,
                "choices": mc_choices(f"(\\bar x,\\bar y): {ans}", f"2({ans})", f"{ans}/2", f"({c/2},{hi/2})"),
                "steps": steps, "finalAnswer": f"(\\bar x,\\bar y): {ans}",
                "insight": "Horizontal strips: length = right − left; \\(\\bar x\\) uses average \\(x\\) of each strip.",
                "visual": "centroid", "difficulty": diff, "visualParams": vp,
                "equations": equations_kit("centroid", setup),
            })
            continue
        if f_local is not None and case in {3, 4, 6, 7, 9}:
            compute = {"f": f_local, "a": 0, "b": b}
        elif f_local is not None and case == 8:
            compute = {"f": f_local, "a": 0, "b": sp.pi}
        elif f_local is not None and case == 12:
            compute = {"f": f_local, "a": 0, "b": b}
        # Explicit algebra for simple closed forms (no skipping)
        if case == 0:
            steps = [
                step("Strategy: rectangle centroid", "A uniform rectangle balances at the center of each side."),
                step("Average the x-edges", f"\\[\\bar x=\\frac{{0+{b}}}{{2}}=\\frac{{{b}}}{{2}}\\]"),
                step("Average the y-edges", f"\\[\\bar y=\\frac{{0+{h}}}{{2}}=\\frac{{{h}}}{{2}}\\]"),
                step("Final centroid", f"\\[(\\bar x,\\bar y)=\\left(\\frac{{{b}}}{{2}},\\frac{{{h}}}{{2}}\\right)\\]"),
            ]
            out.append({"source": source, "title": "Centroid", "prompt": prompt, "choices": mc_choices(f"(\\bar x,\\bar y): {ans}", f"2({ans})", f"{ans}/2", f"({b},{h})"),
                        "steps": steps, "finalAnswer": f"(\\bar x,\\bar y): {ans}",
                        "insight": "Centroid is the balance point of area.", "visual": "centroid", "difficulty": diff,
                        "visualParams": vp, "equations": equations_kit("centroid", setup)})
            x_min = 0
            continue
        if case in {1, 2}:
            steps = [
                step("Strategy: right-triangle vertex average", "For a triangular lamina, the centroid is the average of the three vertices."),
                step("List the vertices", prompt.split("vertices")[-1] if "vertices" in prompt else "Use the three given vertices."),
                step("Average coordinates", f"\\[(\\bar x,\\bar y)={ans}\\]"),
            ]
            out.append({"source": source, "title": "Centroid", "prompt": prompt, "choices": mc_choices(f"(\\bar x,\\bar y): {ans}", f"2({ans})", f"{ans}/2", f"({b},{h})"),
                        "steps": steps, "finalAnswer": f"(\\bar x,\\bar y): {ans}",
                        "insight": "Triangle centroids average the three vertices.", "visual": "centroid", "difficulty": diff,
                        "visualParams": vp, "equations": equations_kit("centroid", setup)})
            x_min = 0
            continue
        if case == 5:
            # Composite body algebra — not a single integral strip setup.
            steps = [
                step("Strategy: composite body", "Treat the L-shape as a large rectangle minus the removed corner rectangle."),
                step("Large rectangle (keep)", f"\\[A_1={b}\\cdot{h}={A1},\\quad (\\bar x_1,\\bar y_1)=\\left({sp.latex(x1)},{sp.latex(y1)}\\right)\\]"),
                step("Removed corner (subtract)", f"\\[A_2={cutw}\\cdot{cuth}={A2},\\quad (\\bar x_2,\\bar y_2)=\\left({sp.latex(x2)},{sp.latex(y2)}\\right)\\]"),
                step("Net area", f"\\[A=A_1-A_2={A1}-{A2}={A}\\]"),
                step("Weighted moments", setup),
                step("Evaluate \\(\\bar x\\)", f"\\[\\bar x=\\frac{{A_1\\bar x_1-A_2\\bar x_2}}{{A}}=\\frac{{({A1})({sp.latex(x1)})-({A2})({sp.latex(x2)})}}{{{A}}}={sp.latex(xb)}\\]"),
                step("Evaluate \\(\\bar y\\)", f"\\[\\bar y=\\frac{{A_1\\bar y_1-A_2\\bar y_2}}{{A}}=\\frac{{({A1})({sp.latex(y1)})-({A2})({sp.latex(y2)})}}{{{A}}}={sp.latex(yb)}\\]"),
                step("Final centroid", f"\\[(\\bar x,\\bar y)={ans}\\]"),
            ]
            out.append({
                "source": source,
                "title": "Centroid",
                "prompt": prompt,
                "choices": mc_choices(
                    f"(\\bar x,\\bar y)={ans}",
                    f"(\\bar x,\\bar y)=\\left({sp.latex(x1)},{sp.latex(y1)}\\right)",
                    f"(\\bar x,\\bar y)=\\left({sp.latex(xb)},{sp.latex(y1)}\\right)",
                    f"(\\bar x,\\bar y)=\\left({sp.latex(x1)},{sp.latex(yb)}\\right)",
                ),
                "steps": steps,
                "finalAnswer": f"(\\bar x,\\bar y)={ans}",
                "insight": "Composite centroids: sum (or subtract) area×center contributions, then divide by net area.",
                "visual": "centroid",
                "difficulty": diff,
                "visualParams": vp,
                "equations": equations_kit("centroid", setup),
            })
            x_min = 0
            continue
        x_min = 0
        out.append(custom_problem(
            source, "Centroid", prompt, f"(\\bar x,\\bar y): {ans}", setup, "centroid", diff, vp,
            "Centroid is the balance point of area. Compute area and both moments fully, then divide — show every bound evaluation.",
            compute=compute,
        ))
    return out


def catalog_inertia_conceptual():
    out = []
    N_INERT = 16
    for i in range(PER_TOPIC):
        case = i % N_INERT
        diff = difficulty_for_index(i)
        tier = difficulty_tier(diff)
        rep = (i // N_INERT) % 2
        j = tier + rep
        b, h = 2 + j, 3 + j
        source = f"OpenStax Vol. 1 §6.6 / Briggs §6.7 inertia concept {case + 1}, item {i + 1}"
        axis_extra = {}
        compute = None
        if case == 0:
            f, xmax = sp.Integer(h), b
            I = sp.integrate(f**3 / 3, (x, 0, xmax))
            label = "I_x"
            prompt = f"Find \\(I_x\\) about the bottom \\(x\\)-axis for a rectangle \\(0\\le x\\le {b}\\), \\(0\\le y\\le {h}\\)."
            setup = f"\\[I_x=\\int_0^{{{b}}}\\frac{{{h}^3}}{{3}}\\,dx\\]"
            top = {"t": "c", "v": h}
            compute = {"expr": f**3 / 3, "a": 0, "b": xmax, "label": "I_x"}
        elif case == 1:
            f, xmax = sp.Integer(h), b
            I = sp.integrate(x**2 * f, (x, 0, xmax))
            label = "I_y"
            prompt = f"Find \\(I_y\\) about the left \\(y\\)-axis for a rectangle \\(0\\le x\\le {b}\\), \\(0\\le y\\le {h}\\)."
            setup = f"\\[I_y=\\int_0^{{{b}}}x^2({h})\\,dx\\]"
            top = {"t": "c", "v": h}
            compute = {"expr": x**2 * f, "a": 0, "b": xmax, "label": "I_y"}
        elif case == 2:
            f, xmax = sp.Integer(h), b
            I = sp.integrate(f**3 / 3, (x, 0, xmax)) + sp.integrate(x**2 * f, (x, 0, xmax))
            label = "J_O"
            prompt = f"Find the polar moment \\(J_O=I_x+I_y\\) about the origin for the rectangle \\(0\\le x\\le {b}\\), \\(0\\le y\\le {h}\\)."
            setup = (
                "\\[J_O=I_x+I_y="
                "\\int_a^b\\frac{[f(x)]^3}{3}\\,dx"
                "+\\int_a^b x^2 f(x)\\,dx\\]"
            )
            top = {"t": "c", "v": h}
            # Full two-part evaluation
            compute = None  # handled specially below
        elif case == 3:
            f, xmax = h * (1 - x / b), b
            I = sp.integrate(f**3 / 3, (x, 0, xmax))
            label = "I_x"
            prompt = f"Find \\(I_x\\) for the right triangle under \\(y={h}(1-x/{b})\\), \\(0\\le x\\le {b}\\)."
            setup = "\\[I_x=\\int_0^b\\frac{f(x)^3}{3}\\,dx\\]"
            top = {"t": "lin", "a": -h / b, "b": h}
            compute = {"expr": f**3 / 3, "a": 0, "b": xmax, "label": "I_x"}
        elif case == 4:
            f, xmax = h * (1 - x / b), b
            I = sp.integrate(x**2 * f, (x, 0, xmax))
            label = "I_y"
            prompt = f"Find \\(I_y\\) for the right triangle under \\(y={h}(1-x/{b})\\), \\(0\\le x\\le {b}\\)."
            setup = "\\[I_y=\\int_0^b x^2 f(x)\\,dx\\]"
            top = {"t": "lin", "a": -h / b, "b": h}
            compute = {"expr": x**2 * f, "a": 0, "b": xmax, "label": "I_y"}
        elif case == 5:
            f, xmax = h * (1 - (x / b) ** 2), b
            I = sp.integrate(f**3 / 3, (x, 0, xmax))
            label = "I_x"
            prompt = f"Find \\(I_x\\) for the parabolic region under \\(y={h}(1-x^2/{b*b})\\), \\(0\\le x\\le {b}\\)."
            setup = "\\[I_x=\\int_0^b\\frac{f(x)^3}{3}\\,dx\\]"
            top = {"t": "poly", "k": [h, 0, -h / (b * b)]}
            compute = {"expr": f**3 / 3, "a": 0, "b": xmax, "label": "I_x"}
        elif case == 6:
            f, xmax = h * (1 - (x / b) ** 2), b
            I = sp.integrate(x**2 * f, (x, 0, xmax))
            label = "I_y"
            prompt = f"Find \\(I_y\\) for the parabolic region under \\(y={h}(1-x^2/{b*b})\\), \\(0\\le x\\le {b}\\)."
            setup = "\\[I_y=\\int_0^b x^2 f(x)\\,dx\\]"
            top = {"t": "poly", "k": [h, 0, -h / (b * b)]}
            compute = {"expr": x**2 * f, "a": 0, "b": xmax, "label": "I_y"}
        elif case == 7:
            f, xmax = h * (1 - x / b), b
            A = sp.integrate(f, (x, 0, xmax))
            ybar = sp.simplify(sp.integrate(f**2 / 2, (x, 0, xmax)) / A)
            Ix = sp.simplify(sp.integrate(f**3 / 3, (x, 0, xmax)))
            I = sp.simplify(Ix - A * ybar**2)
            label = "I_{\\bar x}"
            prompt = f"Find centroidal \\(I_{{\\bar x}}\\) for the triangle under \\(y={h}(1-x/{b})\\)."
            setup = "\\[I_{\\bar x}=I_x-A\\bar y^2\\]"
            top = {"t": "lin", "a": -h / b, "b": h}
            axis_extra = {"axisY": float(ybar.evalf()), "axisLabel": "centroidal x-axis"}
            # Full parallel-axis style evaluation
            steps = [
                step("Strategy: parallel-axis / centroidal second moment", "First compute \\(I_x\\) about the bottom axis, then subtract \\(A\\bar y^2\\)."),
            ] + full_definite_eval_steps(f**3 / 3, 0, xmax, x, label="I_x", scale=1) + [
                step("Area of the region", f"\\[A={nice_latex(A)}\\]"),
                step("Centroid height", f"\\[\\bar y={nice_latex(ybar)}\\]"),
                step("Apply the shift formula", f"\\[I_{{\\bar x}}=I_x-A\\bar y^2={nice_latex(Ix)}-({nice_latex(A)})({nice_latex(ybar)})^2={nice_latex(I)}\\]"),
            ]
            out.append({
                "source": source, "title": "Moment of inertia", "prompt": prompt,
                "choices": mc_choices(f"{label} = {sp.latex(sp.simplify(I))}", f"2I", f"I/2", f"{A}"),
                "steps": steps, "finalAnswer": f"{label} = {sp.latex(sp.simplify(I))}",
                "insight": "Second moment: show \\(I_x\\), area, and \\(\\bar y\\) before subtracting \\(A\\bar y^2\\).",
                "visual": "inertia", "difficulty": diff,
                "visualParams": {"method": "area", "xMin": 0, "xMax": float(xmax), "bottom": {"t": "c", "v": 0}, "top": top, **axis_extra},
                "equations": equations_kit("inertia", setup),
            })
            continue
        elif case == 8:
            d = 1 + j
            f, xmax = h + x, b
            I = sp.integrate((y + d) ** 2, (y, 0, f))
            I = sp.integrate(I, (x, 0, xmax))
            label = f"I_{{y=-{d}}}"
            prompt = f"Find the second moment of the region under \\(y={h}+x\\) on \\([0,{b}]\\) about the horizontal line \\(y=-{d}\\)."
            setup = (
                f"\\[I_{{y=-{d}}}="
                f"\\int_0^{{{b}}}\\frac{{1}}{{3}}"
                f"\\big[(f(x)+{d})^3-{d}^3\\big]\\,dx\\]"
            )
            top = {"t": "lin", "a": 1, "b": h}
            axis_extra = {"axisY": -d, "axisLabel": f"y = -{d}"}
            # After integrating in y: ∫ (1/3)[(f+d)^3 - d^3] dx
            inner = sp.simplify(((f + d) ** 3 - d**3) / 3)
            compute = {"expr": inner, "a": 0, "b": xmax, "label": label}
        elif case == 9:
            d = 1 + j
            f, xmax = h + sp.sqrt(x), b
            I = sp.integrate((x - d) ** 2 * f, (x, 0, xmax))
            label = f"I_{{x={d}}}"
            prompt = f"Find the second moment of the region under \\(y={h}+\\sqrt{{x}}\\) on \\([0,{b}]\\) about the vertical line \\(x={d}\\)."
            setup = f"\\[I_{{x={d}}}=\\int_0^{{{b}}}(x-{d})^2 f(x)\\,dx\\]"
            top = {"t": "sqrt", "a": 1, "b": h}
            axis_extra = {"axisX": d, "axisLabel": f"x = {d}"}
            compute = {"expr": (x - d) ** 2 * f, "a": 0, "b": xmax, "label": label}
        elif case == 10:
            R = 2 + j
            xmax = R
            I = sp.pi * R**4 / 8
            label = "I_x"
            prompt = f"Find \\(I_x\\) about the diameter for the upper semicircular lamina of radius \\({R}\\)."
            setup = "\\[I_x=\\int_{-R}^{R}\\frac{(\\sqrt{R^2-x^2})^3}{3}\\,dx=\\frac{\\pi R^4}{8}\\]"
            top = {"t": "circle-upper", "R": R, "cx": 0, "cy": 0}
            axis_extra = {"axisY": 0, "axisLabel": "diameter"}
            x_min = -R
            compute = {"expr": (sp.sqrt(R**2 - x**2) ** 3) / 3, "a": -R, "b": R, "label": "I_x"}
        elif case == 11:
            R = 2 + j
            xmax = R
            I = sp.pi * R**4 / 16
            label = "I_x"
            prompt = f"Find \\(I_x\\) about the horizontal leg for a quarter-circular lamina of radius \\({R}\\) in the first quadrant."
            setup = "\\[I_x=\\int_0^R\\frac{(\\sqrt{R^2-x^2})^3}{3}\\,dx=\\frac{\\pi R^4}{16}\\]"
            top = {"t": "circle-upper", "R": R, "cx": 0, "cy": 0}
            axis_extra = {"axisY": 0, "axisLabel": "x-axis leg"}
            x_min = 0
            compute = {"expr": (sp.sqrt(R**2 - x**2) ** 3) / 3, "a": 0, "b": R, "label": "I_x"}
        elif case == 12:
            base1, base2, height = 4 + j, 2 + j, 3 + j
            f, xmax = base1 + (base2 - base1) * x / height, height
            I = sp.integrate(f**3 / 3, (x, 0, xmax))
            label = "I_x"
            prompt = f"Find \\(I_x\\) for a trapezoidal lamina with vertical parallel sides \\({base1}\\) and \\({base2}\\), separated by \\({height}\\)."
            setup = "\\[I_x=\\int_0^h\\frac{f(x)^3}{3}\\,dx\\]"
            top = {"t": "lin", "a": (base2 - base1) / height, "b": base1}
            x_min = 0
            compute = {"expr": f**3 / 3, "a": 0, "b": xmax, "label": "I_x"}
        elif case == 13:
            base1, base2, height = 4 + j, 2 + j, 3 + j
            f, xmax = base1 + (base2 - base1) * x / height, height
            I = sp.integrate(x**2 * f, (x, 0, xmax))
            label = "I_y"
            prompt = f"Find \\(I_y\\) for a trapezoidal lamina with vertical parallel sides \\({base1}\\) and \\({base2}\\), separated by \\({height}\\)."
            setup = "\\[I_y=\\int_0^h x^2 f(x)\\,dx\\]"
            top = {"t": "lin", "a": (base2 - base1) / height, "b": base1}
            x_min = 0
            compute = {"expr": x**2 * f, "a": 0, "b": xmax, "label": "I_y"}
        elif case == 14:
            # Horizontal strips: I_y about y-axis for region 0≤x≤c, 0≤y≤√x wait — region between x=y^2 and x=c
            hi = 2 + j
            c = hi * hi
            # I_y = ∫_0^hi (1/3)(x_R^3 - x_L^3) dy = ∫ (1/3)(c^3 - y^6) dy
            I = sp.integrate((c**3 - (y**2) ** 3) / 3, (y, 0, hi))
            label = "I_y"
            prompt = (
                f"Use horizontal strips to find \\(I_y\\) (about the \\(y\\)-axis) for the region "
                f"bounded by \\(x=y^2\\), \\(x={c}\\), and \\(y=0\\)."
            )
            setup = (
                f"\\[I_y=\\int_0^{{{hi}}}\\frac{{1}}{{3}}\\big(({c})^3-(y^2)^3\\big)\\,dy\\]"
            )
            top = {"t": "sqrt", "a": 1}
            xmax = c
            x_min = 0
            axis_extra = {
                "orientation": "horizontal",
                "yMin": 0,
                "yMax": hi,
                "left": {"t": "pow", "a": 1, "n": 2},
                "right": {"t": "c", "v": c},
            }
            compute = {
                "expr": (c**3 - y**6) / 3, "a": 0, "b": hi, "var": y, "label": "I_y",
                "parts": {"f": f"{c}", "var": "y", "orientation": "horizontal"},
                "display_integrand": f"\\frac{{1}}{{3}}\\big(({c})^3-y^6\\big)",
                "setup_display": setup,
            }
        else:
            # Horizontal strips: I_x = ∫ y^2 (right-left) dy
            hi = 2 + j
            c = hi * hi
            I = sp.integrate(y**2 * (c - y**2), (y, 0, hi))
            label = "I_x"
            prompt = (
                f"Use horizontal strips to find \\(I_x\\) (about the \\(x\\)-axis) for the region "
                f"bounded by \\(x=y^2\\), \\(x={c}\\), and \\(y=0\\)."
            )
            setup = f"\\[I_x=\\int_0^{{{hi}}}y^2({c}-y^2)\\,dy\\]"
            top = {"t": "sqrt", "a": 1}
            xmax = c
            x_min = 0
            axis_extra = {
                "orientation": "horizontal",
                "yMin": 0,
                "yMax": hi,
                "left": {"t": "pow", "a": 1, "n": 2},
                "right": {"t": "c", "v": c},
            }
            compute = {
                "expr": y**2 * (c - y**2), "a": 0, "b": hi, "var": y, "label": "I_x",
                "parts": {"f": f"{c}-y^{{2}}", "var": "y", "orientation": "horizontal"},
                "display_integrand": f"y^{{2}}({c}-y^{{2}})",
                "setup_display": setup,
            }
        if case == 2:
            # Polar moment = I_x + I_y with both shown fully
            f, xmax = sp.Integer(h), b
            steps = [
                step("Strategy: polar moment", "\\(J_O=I_x+I_y\\). Compute each second moment fully, then add."),
            ] + full_definite_eval_steps(f**3 / 3, 0, xmax, x, label="I_x", scale=1) + \
              full_definite_eval_steps(x**2 * f, 0, xmax, x, label="I_y", scale=1) + [
                step("Add", f"\\[J_O=I_x+I_y={nice_latex(I)}\\]"),
            ]
            out.append({
                "source": source, "title": "Moment of inertia", "prompt": prompt,
                "choices": mc_choices(f"{label} = {sp.latex(sp.simplify(I))}", f"2J", f"J/2", f"{b*h}"),
                "steps": steps, "finalAnswer": f"{label} = {sp.latex(sp.simplify(I))}",
                "insight": "Polar moment is the sum of the two planar second moments — compute both without shortcuts.",
                "visual": "inertia", "difficulty": diff,
                "visualParams": {"method": "area", "xMin": 0, "xMax": float(xmax), "bottom": {"t": "c", "v": 0}, "top": top},
                "equations": equations_kit("inertia", setup),
            })
            continue
        if "x_min" not in locals():
            x_min = 0
        vp = {"method": "area", "xMin": float(x_min), "xMax": float(xmax), "bottom": {"t": "c", "v": 0}, "top": top, **axis_extra}
        x_min = 0
        out.append(custom_problem(
            source, "Moment of inertia", prompt, f"{label} = {sp.latex(sp.simplify(I))}", setup, "inertia", diff, vp,
            "Second moment of area: expand, integrate term by term, evaluate both bounds, then simplify.",
            compute=compute,
        ))
    return out


# Strict Calc-1/2 rule: no double (or higher) integrals anywhere in a problem.
_DOUBLE_INT_RE = re.compile(
    r"double\s+integral"
    r"|\\iiint|\\iint|\\iiiint"
    r"|\\int\s*\\int"
    r"|\\,d[xy]\\,d[xy]"
    # Iterated form: \int_(...) ^(...) \int with only limits between signs
    r"|\\int(?:_(?:\{[^}]*\}|[^\s\\^])|\\?\^(?:\{[^}]*\}|[^\s\\_]))+\\int",
    re.IGNORECASE,
)

# Strict rule: no hyperbolic functions (sinh, cosh, asinh, …) in any problem text.
_HYPERBOLIC_TEXT_RE = re.compile(
    r"hyperbolic"
    r"|\\sinh|\\cosh|\\tanh|\\coth|\\sech|\\csch"
    r"|\\operatorname\{a?(?:sinh|cosh|tanh|coth|sech|csch)\}"
    r"|(?<![A-Za-z])a?(?:sinh|cosh|tanh|coth|sech|csch)(?![A-Za-z])"
    r'|"t"\s*:\s*"cosh"|"t"\s*:\s*"sinh"',
    re.IGNORECASE,
)


def _collect_strings(obj, out: list[str]) -> None:
    if isinstance(obj, str):
        out.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            _collect_strings(v, out)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _collect_strings(v, out)


def problem_text_blob(problem) -> str:
    parts: list[str] = []
    _collect_strings(problem, parts)
    return "\n".join(parts)


def uses_double_integral(problem) -> str | None:
    """Return a short reason if the problem uses double integration; else None."""
    m = _DOUBLE_INT_RE.search(problem_text_blob(problem))
    if m:
        return m.group(0)
    return None


def uses_hyperbolic(problem) -> str | None:
    """Return a short reason if the problem uses hyperbolic functions; else None."""
    m = _HYPERBOLIC_TEXT_RE.search(problem_text_blob(problem))
    if m:
        return m.group(0)
    return None


def build_bank():
    bank = {
        "fundamentals": catalog_fundamentals_conceptual(),
        "area": catalog_area_varied(),
        "volumes": catalog_volumes_varied(),
        "centroids": catalog_centroids_conceptual(),
        "arc": catalog_arc_varied(),
        "surface": catalog_surface_varied(),
        "inertia": catalog_inertia_conceptual(),
        "applications": catalog_applications_varied(),
    }
    for topic, problems in bank.items():
        if len(problems) < PER_TOPIC:
            raise SystemExit(f"{topic}: only {len(problems)} problems, need {PER_TOPIC}")
        bank[topic] = problems[:PER_TOPIC]
        counts = {"easy": 0, "medium": 0, "hard": 0}
        concepts = set()
        for idx, p in enumerate(bank[topic]):
            d = p.get("difficulty", "easy")
            counts[d] = counts.get(d, 0) + 1
            m = re.search(r"concept\s+(\d+)", p.get("source", ""), flags=re.I)
            if m:
                concepts.add(int(m.group(1)))
            hit = uses_double_integral(p)
            if hit:
                raise SystemExit(
                    f"{topic}[{idx}] uses double integration ({hit!r}): "
                    f"{(p.get('source') or p.get('prompt') or '')[:120]}"
                )
            hit = uses_hyperbolic(p)
            if hit:
                raise SystemExit(
                    f"{topic}[{idx}] uses hyperbolic function ({hit!r}): "
                    f"{(p.get('source') or p.get('prompt') or '')[:120]}"
                )
        if counts.get("easy") != DIFFICULTY_EASY or counts.get("medium") != DIFFICULTY_MEDIUM or counts.get("hard") != DIFFICULTY_HARD:
            raise SystemExit(
                f"{topic}: difficulty mix {counts}, need "
                f"easy={DIFFICULTY_EASY}, medium={DIFFICULTY_MEDIUM}, hard={DIFFICULTY_HARD}"
            )
        min_concepts = 40 if topic == "applications" else 10
        if len(concepts) < min_concepts:
            raise SystemExit(
                f"{topic}: only {len(concepts)} distinct concepts, need ≥ {min_concepts} "
                f"(found {sorted(concepts)})"
            )
    return bank


def js_string(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def _json_safe(obj):
    """Convert sympy numbers / nested structures so json.dumps succeeds."""
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, Fraction):
        return float(obj)
    if isinstance(obj, sp.Basic):
        if obj.is_number:
            try:
                return float(obj)
            except Exception:
                return str(obj)
        return str(obj)
    if isinstance(obj, (sp.Rational, sp.Integer, sp.Float)):
        return float(obj)
    # numpy / plain rationals that sometimes leak into visualParams
    if type(obj).__name__ == "Rational":
        try:
            return float(obj)
        except Exception:
            return str(obj)
    return obj


def emit_problem(p, indent="      "):
    lines = [f"{indent}{{"]
    for key in ["source", "title", "prompt", "finalAnswer", "insight", "visual", "difficulty"]:
        if key in p:
            lines.append(f'{indent}  {key}: {js_string(p[key])},')
    lines.append(f"{indent}  choices: [")
    for c in p["choices"]:
        lines.append(f'{indent}    {{ id: {js_string(c["id"])}, latex: {js_string(c["latex"])}, label: {js_string(c["label"])} }},')
    lines.append(f"{indent}  ],")
    lines.append(f"{indent}  steps: [")
    for s in p["steps"]:
        lines.append(f'{indent}    {{ title: {js_string(s["title"])}, body: {js_string(s["body"])} }},')
    lines.append(f"{indent}  ],")
    if p.get("equations"):
        lines.append(f"{indent}  equations: [")
        for eq in p["equations"]:
            lines.append(f"{indent}    {js_string(eq)},")
        lines.append(f"{indent}  ],")
    if p.get("visualParams"):
        lines.append(f"{indent}  visualParams: {json.dumps(_json_safe(p['visualParams']))}, ")
    lines.append(f"{indent}}},")
    return "\n".join(lines)


def emit_js(bank):
    parts = ['// AUTO-GENERATED by scripts/build-problem-bank.py — do not edit\n']
    parts.append("export const GENERATED_BANK = {")
    for topic in TOPICS:
        problems = bank[topic]
        parts.append(f"  {topic}: [")
        for p in problems:
            parts.append(emit_problem(p, indent="    "))
        parts.append("  ],")
    parts.append("};")
    parts.append(f"\nexport const QUESTIONS_PER_TOPIC = {PER_TOPIC};")
    return "\n".join(parts)


def main():
    bank = build_bank()
    out = Path(__file__).resolve().parent.parent / "src" / "generatedBank.js"
    out.write_text(emit_js(bank), encoding="utf-8")
    for topic in TOPICS:
        print(f"{topic}: {len(bank[topic])} problems")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
