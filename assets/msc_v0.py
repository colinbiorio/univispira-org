#!/usr/bin/env python3
"""
MSC v0 -- dimensionless binding fraction across ~40 orders of magnitude of scale.

    B = (binding energy per constituent) / (rest energy of that constituent)

  * Gravitational systems: this reduces to compactness  C = GM/(R c^2) = (v_esc/c)^2 / 2.
  * Nuclear systems:       binding energy per nucleon / nucleon rest energy.
  * Atomic/condensed:      binding per constituent / rest energy of that constituent,
                           where `constituent` is DECLARED EXPLICITLY per row, because
                           the choice (electron vs atom vs molecule) moves B by ~10^3.

Every row carries `constituent` and `denominator_note` so the plot cannot silently
mix conventions.

Run:  python msc_v0.py
Out:  msc_v0_table.txt, msc_v0.csv, msc_v0.png
"""
from __future__ import annotations

from dataclasses import dataclass, field
import csv
import math

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

# ---------------------------------------------------------------------------
# Constants (CODATA 2018 / IAU nominal)
# ---------------------------------------------------------------------------
G      = 6.67430e-11          # m^3 kg^-1 s^-2
C_L    = 2.99792458e8         # m/s
C2     = C_L ** 2             # J/kg
EV     = 1.602176634e-19      # J
MEV    = 1e6 * EV
U_KG   = 1.66053906660e-27    # kg   (atomic mass unit)
U_MEV  = 931.49410242         # MeV
M_P    = 938.27208816         # MeV  proton
M_N    = 939.56542052         # MeV  neutron
M_E    = 0.51099895000        # MeV  electron
M_H    = M_P + M_E            # MeV  hydrogen atom (binding 13.6 eV is negligible here)
ALPHA  = 7.2973525693e-3
M_SUN  = 1.98847e30           # kg
R_SUN  = 6.957e8              # m
PC     = 3.0856775814913673e16  # m
N_A    = 6.02214076e23

# Cosmology (Planck 2018).
H0_SI      = 67.4e3 / (1e6 * PC)                 # s^-1
RHO_CRIT   = 3 * H0_SI**2 / (8 * math.pi * G)    # kg/m^3
OMEGA_M    = 0.315
OMEGA_L    = 0.685
LAMBDA     = 3 * H0_SI**2 * OMEGA_L / C2         # m^-2   cosmological constant
RHO_LAMBDA = LAMBDA * C2 / (8 * math.pi * G)     # == OMEGA_L * RHO_CRIT
DELTA_VIR  = 200.0                               # virialisation: <rho> > 200 rho_crit
AGE_UNIV   = 4.351e17                            # s  (13.79 Gyr)

# ---------------------------------------------------------------------------
# System record
# ---------------------------------------------------------------------------
@dataclass
class System:
    name: str
    scale_m: float
    regime: str
    constituent: str            # WHAT the "per constituent" is measured over
    binding_J: float            # binding energy PER CONSTITUENT (J)
    constituent_rest_J: float   # rest energy of ONE constituent (J)
    denominator_note: str
    mass_kg: float | None = None
    radius_m: float | None = None
    B_override: float | None = None   # gravitational: report C, not the 3/5 energy fraction
    bound: bool = True
    formal_B: float | None = None     # Lambda-free GM/Rc^2, for systems Lambda unbinds
    ref_B: float | None = None        # spec's reference table, for sanity-check
    notes: str = ""
    state: str = "bound"              # virialised | bound, not virialised | Lambda-unbound
    C_eff: float | None = None        # GM/Rc^2 - (Lambda/6) R^2
    power_W_per_kg: float | None = None   # sustained throughput, if any

    @property
    def B_energetic(self) -> float:
        """Strict energy-fraction reading of the definition."""
        return self.binding_J / self.constituent_rest_J

    @property
    def B(self) -> float:
        """Reported value."""
        if not self.bound:
            return 0.0
        return self.B_energetic if self.B_override is None else self.B_override

    @property
    def B_signed(self) -> float:
        """B' = (sum m_constituents - m_system) / m_system.

        Identically B/(1-B). Since the compactness ceiling puts B <= 1/2, this maps
        the whole domain -- including the confinement regime where B itself diverges
        -- into (-1, +1]. Positive = mass deficit; negative = the bound state is
        HEAVIER than its constituents, i.e. binding supplies the mass.
        """
        b = self.B if self.bound else self.B_energetic
        return b / (1.0 - b)

    @property
    def specific_binding_J_per_kg(self) -> float:
        return self.B_energetic * C2

    @property
    def dissipation(self) -> float | None:
        """D = (throughput over a Hubble time) / (binding energy holding it together).

        D >> 1: the structure is maintained by flow, not held in a static well.
        D << 1: a static well; nothing has to happen for it to persist.
        """
        if self.power_W_per_kg is None:
            return None
        return self.power_W_per_kg * AGE_UNIV / self.specific_binding_J_per_kg


# ---------------------------------------------------------------------------
# Constructors -- one per regime, so the convention is visible at the call site
# ---------------------------------------------------------------------------
def gravitational(name, mass_kg, radius_m, regime="gravitational", scale_m=None,
                  ref_B=None, notes="") -> System:
    """Constituent = a 1 kg mass element. Reported B = compactness GM/(Rc^2).

    The strict energy fraction for a uniform sphere is (3/5)GM/(Rc^2); we report the
    standard compactness and cross-check the two agree (they differ by exactly 3/5).
    """
    compactness = G * mass_kg / (radius_m * C2)
    rho_mean = mass_kg / ((4.0 / 3.0) * math.pi * radius_m**3)
    # Lambda has a potential, so put it inside the metric instead of gating it with
    # an external predicate. C_eff < 0 <=> <rho> < rho_Lambda: the cliff draws itself.
    c_eff = compactness - (LAMBDA / 6.0) * radius_m**2
    is_bound = c_eff > 0
    state = ("virialised" if rho_mean > DELTA_VIR * RHO_CRIT
             else "bound, not virialised" if is_bound else "Lambda-unbound")
    return System(
        name=name,
        scale_m=scale_m if scale_m is not None else radius_m,
        regime=regime if is_bound else "unbound",
        constituent="1 kg mass element",
        binding_J=0.6 * G * mass_kg / radius_m,   # (3/5)GM/R  = J per kg
        constituent_rest_J=C2,                    # rest energy of 1 kg
        denominator_note="c^2 per unit mass (self-gravity of a uniform sphere)",
        mass_kg=mass_kg, radius_m=radius_m,
        B_override=c_eff if is_bound else compactness,
        bound=is_bound,
        formal_B=compactness,
        ref_B=ref_B,
        state=state,
        C_eff=c_eff,
        notes=(notes + f" | <rho>/rho_crit = {rho_mean / RHO_CRIT:.3g}").strip(" |"),
    )


def nuclear(name, A, Z, BE_MeV, scale_m=None, ref_B=None, notes="") -> System:
    """Constituent = one nucleon. Denominator = mean free-nucleon rest energy."""
    N = A - Z
    rest_MeV = (Z * M_P + N * M_N) / A          # mean free-nucleon rest energy
    r = scale_m if scale_m is not None else 1.2e-15 * A ** (1.0 / 3.0)
    return System(
        name=name, scale_m=r, regime="nuclear",
        constituent="nucleon",
        binding_J=(BE_MeV / A) * MEV,
        constituent_rest_J=rest_MeV * MEV,
        denominator_note=f"mean free-nucleon rest energy ({rest_MeV:.2f} MeV)",
        radius_m=r, mass_kg=A * U_KG, ref_B=ref_B, notes=notes,
    )


def chemical(name, scale_m, regime, constituent, binding_eV, rest_mass_u,
             denominator_note, ref_B=None, notes="") -> System:
    """Constituent = whatever `constituent` says. binding_eV is per constituent."""
    return System(
        name=name, scale_m=scale_m, regime=regime,
        constituent=constituent,
        binding_J=binding_eV * EV,
        constituent_rest_J=rest_mass_u * U_MEV * MEV,
        denominator_note=denominator_note,
        mass_kg=rest_mass_u * U_KG, ref_B=ref_B, notes=notes,
    )


def specific(name, scale_m, regime, constituent, spec_binding_J_per_kg,
             denominator_note, ref_B=None, notes="") -> System:
    """For heterogeneous matter: give specific binding energy [J/kg]; B = that / c^2."""
    return System(
        name=name, scale_m=scale_m, regime=regime, constituent=constituent,
        binding_J=spec_binding_J_per_kg, constituent_rest_J=C2,
        denominator_note=denominator_note, ref_B=ref_B, notes=notes,
    )


def black_hole(name, mass_kg) -> System:
    """R = Schwarzschild radius => C = 1/2 exactly, computed not asserted."""
    r_s = 2 * G * mass_kg / C2
    s = gravitational(name, mass_kg, r_s, regime="ceiling", ref_B=0.5,
                      notes="R = Schwarzschild radius")
    s.denominator_note = "c^2 per unit mass; C = GM/(R_s c^2) = 1/2 identically"
    return s


# ---------------------------------------------------------------------------
# The table
# ---------------------------------------------------------------------------
# Cohesive energies below are all the SAME convention: energy to remove one
# constituent from the bulk to infinity (= sublimation enthalpy per constituent).
# The constituent differs by material -- atoms for metals/covalent networks,
# molecules for molecular solids -- and that choice is the metric's main ambiguity.

SYSTEMS: list[System] = [
    # ---- nuclear ---------------------------------------------------------
    nuclear("Deuteron (H-2)",  2,  1,    2.224566, scale_m=2.1e-15, ref_B=1.2e-3,
            notes="anomalously large: rms radius ~2.1 fm, not 1.2*A^(1/3)"),
    nuclear("Helium-4",        4,  2,   28.29566,  ref_B=7.5e-3),
    nuclear("Carbon-12",      12,  6,   92.16175),
    nuclear("Oxygen-16",      16,  8,  127.6193),
    nuclear("Iron-56",        56, 26,  492.2586,   ref_B=9.4e-3, notes="colloquial 'iron peak'"),
    nuclear("Nickel-62",      62, 28,  545.2626,   notes="TRUE max BE/A: 8.7946 MeV vs Fe-56 8.7903"),
    nuclear("Lead-208",      208, 82, 1636.4302),
    nuclear("Uranium-238",   238, 92, 1801.6946,   ref_B=8.1e-3),

    # ---- atomic / molecular ---------------------------------------------
    chemical("Hydrogen atom", 1.06e-10, "atomic", "the atom (p + e)",
             13.605693, M_H / U_MEV,
             "rest energy of the whole atom. PER-ELECTRON would give the same number here "
             "(1 electron), but dividing by m_e c^2 instead gives 2.7e-5 -- a 10^3 shift.",
             ref_B=1.4e-8),
    chemical("H2 molecule", 1.06e-10, "molecular", "H atom",
             4.4781 / 2, M_H / U_MEV,
             "rest energy of one H ATOM; numerator is D0/2 (dissociation to 2 free H). "
             "Electronic binding of the atoms themselves is excluded -- molecular bond only.",
             ref_B=2.4e-9),
    chemical("H2O molecule (atomization)", 1.5e-10, "molecular", "atom (mean of 2H+O)",
             9.511 / 3, 18.0153 / 3,
             "mean per-atom rest energy in H2O; numerator is full atomization / 3 atoms."),

    # ---- condensed matter ------------------------------------------------
    chemical("Ice (H2O solid)", 3.0e-10, "condensed", "H2O molecule",
             0.529, 18.0153,
             "rest energy of one H2O molecule; numerator = sublimation enthalpy per "
             "molecule (51.06 kJ/mol). Ref table used a SINGLE H-bond (~0.25 eV) -> 2x lower.",
             ref_B=1.5e-11, notes="a water molecule has ~2 H-bonds (4 shared)"),
    chemical("Liquid water", 3.0e-10, "condensed", "H2O molecule",
             0.456, 18.0153,
             "rest energy of one H2O molecule; numerator = enthalpy of vaporization (44.0 kJ/mol)."),
    chemical("Iron crystal (bcc)", 2.5e-10, "condensed", "Fe atom",
             4.28, 55.845,
             "rest energy of one Fe atom; numerator = metallic cohesive energy.",
             ref_B=8.1e-11),
    chemical("NaCl crystal", 2.8e-10, "condensed", "ion pair NaCl",
             8.16, 58.443,
             "rest energy of one formula unit; numerator = lattice energy (787 kJ/mol)."),
    chemical("Quartz (SiO2)", 1.6e-10, "condensed", "atom (mean of Si+2O)",
             1860e3 / N_A / EV / 3, 60.083 / 3,
             "mean per-atom rest energy; numerator = atomization energy / 3 atoms."),
    # Mass-weighted atomization energy of lunar regolith, from the major oxides.
    # (mass fraction, kJ/mol atomization, g/mol): SiO2, Al2O3, CaO, FeO, MgO, TiO2
    specific("Moon (chemical)", 3.0e-10, "condensed", "atom (mean, lunar silicate)",
             sum(f * e * 1e3 / (mm * 1e-3) for f, e, mm in [
                 (0.45, 1859.1, 60.083), (0.15, 3083.3, 101.961), (0.11, 1062.1, 56.077),
                 (0.11,  937.0,  71.844), (0.09,  997.9,  40.304), (0.03, 1915.4, 79.866),
                 (0.06, 1859.1,  60.083)]),
             "c^2 per unit mass; mass-weighted atomization of the major lunar oxides.",
             notes="SAME BODY as the gravitational 'Moon' row -- both values are correct"),
    chemical("Diamond", 1.54e-10, "condensed", "C atom",
             7.37, 12.011,
             "rest energy of one C atom; numerator = covalent cohesive energy. "
             "Highest per-atom chemical binding of any bulk solid."),

    # ---- biological ------------------------------------------------------
    specific("Brain tissue", 1.0e-5, "biological", "molecule (mass-weighted)",
             0.78 * 2.409e6 + 0.22 * 8.0e5,
             "c^2 per unit mass. 78% water (dH_vap 43.4 kJ/mol at 37C) + 22% "
             "biomolecules (~8e5 J/kg, uncertain to a factor ~2). Intermolecular "
             "cohesion only -- the convention used for ice and liquid water.",
             notes="scale = cortical column, but B is size-independent"),

    # ---- gravitational ---------------------------------------------------
    gravitational("Ceres",            9.3835e20, 4.696e5),
    gravitational("Moon",             7.342e22,  1.7374e6),
    gravitational("Earth",            5.9722e24, 6.371e6,   ref_B=6.9e-10),
    gravitational("Jupiter",          1.8982e27, 6.9911e7),
    gravitational("Brown dwarf",      0.05 * M_SUN, 0.10 * R_SUN),
    gravitational("Red dwarf (M5V)",  0.20 * M_SUN, 0.20 * R_SUN,
                  notes="C same as Sun: M and R scale together on the main sequence"),
    gravitational("Sun",              M_SUN,     R_SUN,     ref_B=2.1e-6),
    gravitational("Red giant",        16 * M_SUN, 764 * R_SUN, notes="Betelgeuse-like"),
    gravitational("White dwarf",      1.00 * M_SUN, 7.0e6, regime="compact", ref_B=2.1e-4),
    gravitational("Neutron star",     1.40 * M_SUN, 1.2e4,  regime="compact", ref_B=1.7e-1),
    black_hole   ("Black hole (10 Msun)",  10 * M_SUN),
    black_hole   ("Black hole (Sgr A*)",   4.3e6 * M_SUN),

    # ---- self-gravitating aggregates ------------------------------------
    gravitational("Solar system",     M_SUN, 4.5e12, notes="bound to Neptune's orbit"),
    gravitational("Open cluster",     1.0e3 * M_SUN, 3 * PC),
    gravitational("Globular cluster", 5.0e5 * M_SUN, 10 * PC),
    gravitational("Milky Way",        1.5e12 * M_SUN, 1.5e21, ref_B=1.5e-6,
                  notes="incl. dark halo"),
    gravitational("Galaxy cluster",   1.0e15 * M_SUN, 3e22,   ref_B=4.9e-5,
                  notes="Coma-like"),
    gravitational("Supercluster",     1.0e17 * M_SUN, 2.5e24, ref_B=0.0,
                  notes="Laniakea: ~160 Mpc across, so R ~ 2.5e24 m"),
    gravitational("Homogeneity scale", OMEGA_M * RHO_CRIT * (4/3) * math.pi * (3e24)**3, 3e24,
                  ref_B=0.0, notes="sphere at the cosmic mean density"),
]

# ---------------------------------------------------------------------------
# Sustained throughput (W/kg). Present only for systems that actually dissipate.
# ---------------------------------------------------------------------------
HAWKING_W = lambda M: 1.054571817e-34 * C_L**6 / (15360 * math.pi * G**2 * M**2)

THROUGHPUT = {
    "Brain tissue":         20.0 / 1.4,                 # ~20 W of a 1.4 kg organ
    "Sun":                  3.828e26 / M_SUN,           # bolometric luminosity
    "Red giant":            4.82e31 / (16 * M_SUN),     # Betelgeuse ~1.26e5 Lsun
    "Earth":                47e12 / 5.9722e24,          # 47 TW internal heat flow
    "Jupiter":              3.35e17 / 1.8982e27,        # excess internal luminosity
    "Moon":                 6.07e11 / 7.342e22,          # ~16 mW/m^2 Apollo heat flow
    "Diamond":              0.0,
    "Iron crystal (bcc)":   0.0,
    "Ice (H2O solid)":      0.0,
    "Black hole (10 Msun)": HAWKING_W(10 * M_SUN) / (10 * M_SUN),
}
for _s in SYSTEMS:
    if _s.name in THROUGHPUT:
        _s.power_W_per_kg = THROUGHPUT[_s.name]

# ---------------------------------------------------------------------------
# Domain boundary: where the definition of B inverts (not plotted)
# ---------------------------------------------------------------------------
QUARK_REST_MEV = 2 * 2.16 + 4.67          # uud current-quark masses
PROTON_B = (QUARK_REST_MEV - M_P) / QUARK_REST_MEV


# ---------------------------------------------------------------------------
# Cross-checks -- independent recomputation, to catch unit errors
# ---------------------------------------------------------------------------
M_H_ATOMIC_U = 1.00782503207
M_N_U        = 1.00866491588


def crosschecks() -> list[tuple[str, bool, str]]:
    out: list[tuple[str, bool, str]] = []

    def chk(label, a, b, tol, unit=""):
        ok = abs(a - b) <= tol * max(abs(a), abs(b))
        out.append((label, ok, f"{a:.6g}{unit} vs {b:.6g}{unit}  (rel {abs(a-b)/max(abs(a),abs(b)):.2e})"))

    # 1. Gravitational: compactness from the formula vs from escape velocity.
    for s in SYSTEMS:
        if s.constituent != "1 kg mass element":
            continue
        v_esc = math.sqrt(2 * G * s.mass_kg / s.radius_m)
        chk(f"[grav] {s.name}: GM/Rc^2 == (v_esc/c)^2/2",
            s.formal_B, (v_esc / C_L) ** 2 / 2, 1e-12)

    # 2. Compactness vs the strict energy fraction (uniform sphere): ratio must be 5/3,
    #    i.e. the two readings agree to well within an order of magnitude.
    for s in SYSTEMS:
        if s.constituent != "1 kg mass element":
            continue
        chk(f"[grav] {s.name}: C / B_energetic == 5/3",
            s.formal_B / s.B_energetic, 5 / 3, 1e-12)

    # 3. Nuclear binding energies re-derived from measured ATOMIC masses.
    for name, A, Z, m_atomic_u, BE_tab in [
        ("Helium-4",     4,  2,   4.00260325413,  28.29566),
        ("Iron-56",     56, 26,  55.93493633,    492.2586),
        ("Uranium-238",238, 92, 238.05078826,  1801.6946),
    ]:
        defect_u = Z * M_H_ATOMIC_U + (A - Z) * M_N_U - m_atomic_u
        chk(f"[nucl] {name}: BE from mass defect vs table",
            defect_u * U_MEV, BE_tab, 1e-5, " MeV")

    # 4. Hydrogen binding from the fine-structure constant.
    chk("[atom] H binding: m_e c^2 alpha^2/2 vs 13.6057 eV",
        M_E * 1e6 * ALPHA**2 / 2, 13.605693, 1e-3, " eV")

    # 5. Cohesive energy unit round-trip: eV/atom -> kJ/mol vs literature Fe.
    chk("[cond] Fe cohesive 4.28 eV/atom vs 416 kJ/mol subl.",
        4.28 * EV * N_A / 1e3, 416.0, 0.02, " kJ/mol")

    # 5b. Signed B' re-derived from atomic masses, independent of the B pipeline.
    fe = next(x for x in SYSTEMS if x.name == "Iron-56")
    sum_u = 26 * M_H_ATOMIC_U + 30 * M_N_U
    chk("[sign] Fe-56: B'=(sum m - m_sys)/m_sys vs B/(1-B)",
        (sum_u - 55.93493633) / 55.93493633, fe.B_signed, 1e-3)

    # 5c. The compactness ceiling B <= 1/2 maps to B' <= 1 under B/(1-B).
    for x in SYSTEMS:
        if x.regime == "ceiling":
            chk(f"[sign] {x.name}: B' == 1 exactly", x.B_signed, 1.0, 1e-12)

    # 5d. C_eff changes sign exactly where <rho> crosses rho_Lambda -- i.e. the
    #     external boundedness predicate is now redundant, not merely consistent.
    for x in SYSTEMS:
        if x.C_eff is None:
            continue
        rho = x.mass_kg / ((4.0 / 3.0) * math.pi * x.radius_m**3)
        out.append((f"[Lam]  {x.name}: sign(C_eff) == (rho > rho_Lambda)",
                    (x.C_eff > 0) == (rho > RHO_LAMBDA),
                    f"C_eff={x.C_eff:+.3e}, rho/rho_L={rho / RHO_LAMBDA:.3g}"))

    # 5e. The Sun's turnover time is the Kelvin-Helmholtz timescale (~1.9e7 yr).
    sun = next(x for x in SYSTEMS if x.name == "Sun")
    chk("[diss] Sun turnover == Kelvin-Helmholtz timescale",
        sun.specific_binding_J_per_kg / sun.power_W_per_kg / 3.156e7, 1.9e7, 0.05, " yr")

    # 6. The ceiling is exact, not asserted.
    for s in SYSTEMS:
        if s.regime == "ceiling":
            chk(f"[bh]   {s.name}: C == 1/2", s.B, 0.5, 1e-12)

    # 7. Agreement with the spec's reference table (order-of-magnitude tolerance).
    for s in SYSTEMS:
        if s.ref_B is None:
            continue
        if s.ref_B == 0.0:
            ok = s.B == 0.0
            out.append((f"[ref]  {s.name}: expected 0 (unbound)", ok, f"got {s.B:.3g}"))
        else:
            ratio = s.B / s.ref_B
            ok = 0.1 < ratio < 10.0
            out.append((f"[ref]  {s.name}: vs reference table", ok,
                        f"{s.B:.3g} vs {s.ref_B:.3g}  (ratio {ratio:.2f})"))
    return out


# ---------------------------------------------------------------------------
# Text + CSV output
# ---------------------------------------------------------------------------
def write_table(path_txt="msc_v0_table.txt", path_csv="msc_v0.csv") -> str:
    rows = sorted(SYSTEMS, key=lambda s: s.scale_m)
    w = [30, 11, 11, 15, 24]
    head = (f"{'system':<{w[0]}} {'scale (m)':>{w[1]}} {'B':>{w[2]}} "
            f"{'regime':<{w[3]}} {'constituent':<{w[4]}}")
    lines = [head, "-" * len(head)]
    for s in rows:
        b = "0 (unbound)" if not s.bound else f"{s.B:.3e}"
        lines.append(f"{s.name:<{w[0]}} {s.scale_m:>{w[1]}.2e} {b:>{w[2]}} "
                     f"{s.regime:<{w[3]}} {s.constituent:<{w[4]}}")
    txt = "\n".join(lines)
    with open(path_txt, "w") as f:
        f.write(txt + "\n")
    with open(path_csv, "w", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["name", "scale_m", "B", "B_energetic", "formal_compactness",
                     "regime", "bound", "constituent", "mass_kg", "radius_m",
                     "binding_J_per_constituent", "constituent_rest_J",
                     "ref_B", "denominator_note", "notes"])
        for s in rows:
            wr.writerow([s.name, s.scale_m, s.B, s.B_energetic, s.formal_B, s.regime,
                         s.bound, s.constituent, s.mass_kg, s.radius_m, s.binding_J,
                         s.constituent_rest_J, s.ref_B, s.denominator_note, s.notes])
    return txt

# ---------------------------------------------------------------------------
# Is B many-to-one generically, or are the four pairs cherry-picked?
# ---------------------------------------------------------------------------
FAMILY = {"nuclear": "nuclear", "atomic": "chemical", "molecular": "chemical",
          "condensed": "chemical", "biological": "chemical",
          "gravitational": "gravitational", "compact": "gravitational",
          "ceiling": "gravitational"}

TOL = 0.10                       # 10% in B
LTOL = math.log10(1 + TOL)       # 0.0414 dex


def _same_body(a: System, b: System) -> bool:
    """Exclude the Moon colliding with itself measured at a different level."""
    return a.name.split(" (")[0] == b.name.split(" (")[0]


def collision_stats(trials: int = 20000, seed: int = 0) -> dict:
    """Observed cross-family collision count vs a null that preserves each family's
    observed range in log B. The reviewer's pigeonhole objection, quantified."""
    rng = np.random.default_rng(seed)
    pts = [(s, FAMILY[s.regime], math.log10(s.B)) for s in SYSTEMS if s.bound]

    fams = sorted({f for _, f, _ in pts})
    idx = {f: [i for i, (_, g, _) in enumerate(pts) if g == f] for f in fams}
    rng_lo = {f: min(pts[i][2] for i in idx[f]) for f in fams}
    rng_hi = {f: max(pts[i][2] for i in idx[f]) for f in fams}

    def count(vals):
        n = 0
        for i in range(len(pts)):
            for j in range(i + 1, len(pts)):
                if pts[i][1] == pts[j][1] or _same_body(pts[i][0], pts[j][0]):
                    continue
                if abs(vals[i] - vals[j]) <= LTOL:
                    n += 1
        return n

    observed_pairs = [(pts[i][0], pts[j][0], abs(pts[i][2] - pts[j][2]))
                      for i in range(len(pts)) for j in range(i + 1, len(pts))
                      if pts[i][1] != pts[j][1] and not _same_body(pts[i][0], pts[j][0])
                      and abs(pts[i][2] - pts[j][2]) <= LTOL]
    observed = len(observed_pairs)

    null = np.empty(trials, dtype=int)
    base = [p[2] for p in pts]
    for t in range(trials):
        v = list(base)
        for f in fams:
            for i in idx[f]:
                v[i] = rng.uniform(rng_lo[f], rng_hi[f])
        null[t] = count(v)

    # How much of B's range do chemical and gravitational systems share?
    lo = max(rng_lo["chemical"], rng_lo["gravitational"])
    hi = min(rng_hi["chemical"], rng_hi["gravitational"])
    grav_in = [s for s, f, v in pts if f == "gravitational" and lo <= v <= hi]
    twinned = [s for s in grav_in
               if any(FAMILY[o.regime] == "chemical" and not _same_body(s, o)
                      and abs(math.log10(s.B) - math.log10(o.B)) <= LTOL
                      for o in SYSTEMS if o.bound)]

    total_cross = sum(1 for i in range(len(pts)) for j in range(i + 1, len(pts))
                      if pts[i][1] != pts[j][1] and not _same_body(pts[i][0], pts[j][0]))
    return dict(observed=observed, pairs=observed_pairs, null=null,
                total_cross=total_cross, overlap=(lo, hi),
                grav_in=grav_in, twinned=twinned,
                p=float((null >= observed).mean()))


# ---------------------------------------------------------------------------
# Plot
# ---------------------------------------------------------------------------
REGIME_STYLE = {
    "nuclear":       ("#D55E00", "o", "nuclear"),
    "atomic":        ("#0072B2", "s", "atomic"),
    "molecular":     ("#56B4E9", "D", "molecular"),
    "condensed":     ("#009E73", "^", "condensed matter"),
    "biological":    ("#CC79A7", "P", "biological"),
    "gravitational": ("#E69F00", "o", "gravitational"),
    "compact":       ("#8B0000", "*", "compact object"),
    "ceiling":       ("#000000", "X", "black hole (ceiling)"),
    "unbound":       ("#9E9E9E", "v", "unbound (B = 0)"),
}

# name -> (label_x, label_y, horizontal-alignment)   [absolute data coords]
LABELS = {
    "Deuteron (H-2)":        (-15.9,  -3.35, "left"),
    "Iron-56":               (-13.6,  -1.55, "left"),
    "Uranium-238":           (-13.2,  -2.45, "left"),
    "Hydrogen atom":         (-11.4,  -7.70, "right"),
    "H2 molecule":           (-11.4,  -8.48, "right"),
    "Diamond":               (-11.4,  -9.22, "right"),
    "Quartz (SiO2)":         (-11.4,  -9.96, "right"),
    "NaCl crystal":          ( -8.5,  -9.10, "left"),
    "Iron crystal (bcc)":    ( -8.5,  -9.72, "left"),
    "Ice (H2O solid)":       ( -8.5,  -10.34, "left"),
    "Liquid water":          ( -8.5,  -10.96, "left"),
    "Brain tissue":          ( -4.2,  -11.35, "left"),
    "Moon (chemical)":       ( -8.5,  -8.48, "left"),
    "Neutron star":          (  2.5,  -1.45, "right"),
    "Black hole (10 Msun)":  (  4.47,  0.30, "center"),
    "Black hole (Sgr A*)":   ( 10.10,  0.30, "center"),
    "White dwarf":           (  5.3,  -2.95, "right"),
    "Sun":                   (  9.7,  -4.95, "left"),
    "Jupiter":               (  8.7,  -7.40, "left"),
    "Earth":                 (  5.9,  -8.55, "right"),
    "Moon":                  (  5.1,  -10.15, "right"),
    "Ceres":                 (  4.6,  -12.30, "right"),
    "Red giant":             ( 11.0,  -6.55, "right"),
    "Solar system":          ( 11.5,  -10.20, "right"),
    "Open cluster":          ( 16.3,  -11.50, "right"),
    "Globular cluster":      ( 18.3,  -7.85, "left"),
    "Milky Way":             ( 20.3,  -6.65, "right"),
    "Galaxy cluster":        ( 21.5,  -3.45, "right"),
    "Supercluster":          ( 26.3,  -12.25, "left"),
    "Homogeneity scale":     ( 26.3,  -13.45, "left"),
}

FLOOR = -13.0
XLIM  = (-16.4, 29.6)
YLIM  = (-13.9, 0.95)


def make_plot(path="msc_v0.png") -> None:
    fig, ax = plt.subplots(figsize=(16, 9))

    # Strips, not points: the nuclear and chemical forces SATURATE (they bind only
    # neighbours), so per-constituent binding stops caring about system size past a
    # few shells. B is intensive there and the row is really a horizontal line
    # spanning every scale. Gravity does not saturate -- every mass pulls every
    # other -- so B stays extensive and climbs. The bands are the signature.
    for fam, col, txt in [
        (("nuclear",), "#D55E00", "nuclear force saturates → B intensive"),
        (("atomic", "molecular", "condensed", "biological"), "#009E73",
         "chemical bonds saturate → B intensive"),
    ]:
        grp = [s for s in SYSTEMS if s.regime in fam]
        lo, hi = math.log10(min(s.B for s in grp)), math.log10(max(s.B for s in grp))
        ax.axhspan(lo, hi, color=col, alpha=0.075, zorder=0)
        ax.text(23.8, (hi + lo) / 2, txt, fontsize=8.4, color=col, ha="right",
                va="center", style="italic", zorder=1)
    ax.text(14.5, -3.35, "gravity does not saturate →\nB stays extensive, and climbs",
            fontsize=8.8, color="#B07A00", style="italic", ha="center", zorder=6)

    # Reference lines.
    ax.axhline(math.log10(0.5), color="k", ls="--", lw=1.3, zorder=2)
    ax.text(-16.0, math.log10(0.5) + 0.17, "black hole limit:  C = GM/Rc² = 1/2",
            fontsize=10.5, fontweight="bold", va="bottom")
    ax.axvline(math.log10(3e24), color="#666666", ls=":", lw=1.3, zorder=2)
    ax.text(math.log10(3e24) + 0.30, -1.9, "homogeneity scale", fontsize=9,
            color="#444444", rotation=90, ha="left", va="center")

    seen = set()
    for s in sorted(SYSTEMS, key=lambda s: s.scale_m):
        color, marker, label = REGIME_STYLE[s.regime]
        x = math.log10(s.scale_m)
        legend_label = label if label not in seen else None
        seen.add(label)

        if not s.bound:
            yf = math.log10(s.formal_B)          # what the formula alone would report
            ax.scatter([x], [yf], s=75, facecolors="none", edgecolors="#8A8A8A",
                       linewidths=1.5, zorder=3)
            ax.plot([x, x], [yf, FLOOR], color="#8A8A8A", ls=":", lw=1.2, zorder=3)
            ax.scatter([x], [FLOOR], s=115, c=color, marker=marker, edgecolors="k",
                       linewidths=0.6, label=legend_label, zorder=4)
            y = FLOOR
        else:
            y = math.log10(s.B)
            ax.scatter([x], [y], s=195 if s.regime in ("ceiling", "compact") else 88,
                       c=color, marker=marker, edgecolors="k", linewidths=0.6,
                       label=legend_label, zorder=4)

        if s.name in LABELS:
            lx, ly, ha = LABELS[s.name]
            ax.annotate(s.name, (x, y), xytext=(lx, ly), ha=ha, va="center", fontsize=8.7,
                        color="#222222", zorder=6,
                        arrowprops=dict(arrowstyle="-", lw=0.6, color="#AAAAAA",
                                        shrinkA=1, shrinkB=4))

    # Finding 2, drawn: the highest-binding solid vs the most differentiated one.
    d = next(s for s in SYSTEMS if s.name == "Diamond")
    b = next(s for s in SYSTEMS if s.name == "Brain tissue")
    dx, dy = math.log10(d.scale_m), math.log10(d.B)
    bx, by = math.log10(b.scale_m), math.log10(b.B)
    ax.annotate("", xy=(dx, dy), xytext=(bx, by), zorder=5,
                arrowprops=dict(arrowstyle="<->", color="#B0338A", lw=1.4,
                                connectionstyle="arc3,rad=0.42", shrinkA=6, shrinkB=6))
    ax.text(-7.35, -12.35, f"diamond binds {d.B / b.B:.0f}× tighter than brain tissue\n"
                           "→ binding strength alone cannot locate minds",
            fontsize=9, color="#B0338A", ha="center", va="center", style="italic", zorder=6)

    # Finding 3, drawn: compactness keeps rising where boundedness has already failed.
    ax.annotate("hollow = GM/Rc², still rising.\n"
                "C_eff = GM/Rc² − (Λ/6)R² goes\nnegative here: the cliff is in the\nmetric, not in a side predicate",
                xy=(24.40, -4.23), xytext=(25.0, -7.4), ha="left", va="center",
                fontsize=8.6, color="#555555", style="italic", zorder=6,
                arrowprops=dict(arrowstyle="->", lw=0.9, color="#8A8A8A",
                                connectionstyle="arc3,rad=0.25"))

    # Inset: the two terms of C_eff against R. Where the Lambda curve overtakes a
    # system's compactness, C_eff flips sign. That crossing IS the cliff.
    ins = ax.inset_axes([0.250, 0.335, 0.190, 0.250])
    rr = np.logspace(20.8, 25.3, 200)
    ins.loglog(rr, (LAMBDA / 6) * rr**2, color="#555555", lw=1.7, zorder=2)
    ins.text(1.1e21, 1.1e-6, "(Λ/6)R²", fontsize=7.4, color="#555555", rotation=41)
    for nm in ["Milky Way", "Galaxy cluster", "Supercluster", "Homogeneity scale"]:
        sysm = next(x for x in SYSTEMS if x.name == nm)
        ins.loglog([sysm.radius_m], [sysm.formal_B], "o" if sysm.bound else "v", ms=6,
                   color="#E69F00" if sysm.bound else "#9E9E9E", mec="k", mew=0.5, zorder=3)
    ins.text(2.6e24, 1.1e-5, "below the line:\nC_eff < 0", fontsize=6.8,
             color="#777777", ha="center", va="top")
    ins.set_xlabel("R  (m)", fontsize=7.4, labelpad=1)
    ins.set_ylabel("GM/Rc²", fontsize=7.4, labelpad=1)
    ins.tick_params(labelsize=6.4, pad=1.5)
    ins.set_ylim(3e-11, 9e-4)
    ins.grid(alpha=0.15, lw=0.4)
    ins.set_title("the cliff, derived not asserted", fontsize=7.8, pad=3)

    ax.set_xlim(*XLIM)
    ax.set_ylim(*YLIM)
    ax.set_xlabel("log₁₀   characteristic scale   (m)", fontsize=12.5)
    ax.set_ylabel("log₁₀  B   =   binding energy per constituent  /  rest energy per constituent",
                  fontsize=12)
    ax.set_title("MSC v0 — dimensionless binding fraction across 40 orders of magnitude of scale",
                 fontsize=15, fontweight="bold", pad=14)
    ax.grid(alpha=0.16, lw=0.6)
    ax.set_axisbelow(True)

    handles, lbls = ax.get_legend_handles_labels()
    order = ["nuclear", "atomic", "molecular", "condensed matter", "biological",
             "gravitational", "compact object", "black hole (ceiling)", "unbound (B = 0)"]
    pairs = {l: h for h, l in zip(handles, lbls)}
    ax.legend([pairs[o] for o in order if o in pairs], [o for o in order if o in pairs],
              loc="upper left", bbox_to_anchor=(0.118, 0.862), fontsize=9.5,
              framealpha=0.96, ncol=2, borderpad=0.7)

    fig.tight_layout()
    fig.savefig(path, dpi=170)
    plt.close(fig)



def make_plane_plot(path="msc_v0_plane.png") -> None:
    """B against the dissipation index: held by depth vs. held by flow."""
    fig, ax = plt.subplots(figsize=(12, 8))
    D_FLOOR, XL, YL = -3.4, (-11.9, 0.4), (-4.15, 14.6)

    ax.axhspan(0, YL[1], color="#CC79A7", alpha=0.06, zorder=0)
    ax.axhspan(YL[0], 0, color="#0072B2", alpha=0.05, zorder=0)
    ax.axhline(0, color="#444444", ls="--", lw=1.2, zorder=2)
    ax.text(-0.3, 0.18, "D = 1", fontsize=9.5, color="#444444", va="bottom", ha="right")
    ax.text(-11.65, 11.6, "HELD BY FLOW\ndissipative structures", fontsize=11.5,
            color="#A03070", fontweight="bold", va="center", ha="left", zorder=6)
    ax.text(-11.65, -1.98, "HELD BY DEPTH\nstatic wells", fontsize=11.5,
            color="#2A5D86", fontweight="bold", va="center", ha="left", zorder=6)

    OFF = {"Brain tissue": 0.62, "Red giant": 0.62, "Sun": 0.62, "Moon": 0.62,
           "Earth": -0.95, "Jupiter": -0.95, "Ice (H2O solid)": 0.34,
           "Iron crystal (bcc)": 0.80, "Diamond": 0.34, "Black hole (10 Msun)": 0.44}
    for sysm in [x for x in SYSTEMS if x.dissipation is not None]:
        x, d = math.log10(sysm.B), sysm.dissipation
        floored = d <= 10**D_FLOOR
        y = D_FLOOR if floored else math.log10(d)
        col, mk, _ = REGIME_STYLE[sysm.regime]
        ax.scatter([x], [y], s=210 if sysm.regime == "ceiling" else 140, c=col, marker=mk,
                   edgecolors="k", linewidths=0.7, zorder=4)
        ax.annotate(sysm.name, (x, y), xytext=(x, y + OFF.get(sysm.name, 0.6)),
                    ha="center", fontsize=9.2, zorder=5)
    ax.text(-6.2, D_FLOOR - 0.52, "D ≈ 0 — no throughput at all (true zero for the solids; "
            "7e−61 for the black hole)", fontsize=8.4, color="#2A5D86",
            style="italic", ha="center", zorder=6)

    # The claim the paper wants and B cannot support.
    ax.text(-8.35, 6.35, "the two systems the paper most wants to call the\n"
            "same kind of thing land on the same side — while\n"
            "B alone puts 5 orders of magnitude between them",
            fontsize=9, color="#A03070", style="italic", ha="center", zorder=6)
    for tgt in [(-10.64, 12.48), (-5.67, 2.86)]:
        ax.annotate("", xy=tgt, xytext=(-8.35, 6.35 + (1.05 if tgt[1] > 6 else -1.05)),
                    zorder=5, arrowprops=dict(arrowstyle="->", lw=1.0, color="#CC79A7",
                                              connectionstyle="arc3,rad=0.16"))

    # The honest failure: D counts throughput, not load-bearing throughput.
    ax.annotate("the Moon clears D = 1 on radiogenic heat it does\n"
                "not depend on. D counts ALL throughput, not the\n"
                "throughput whose cessation destroys the structure —\n"
                "which is the part that is actually hard to define.",
                xy=(-10.50, 0.33), xytext=(-11.6, 3.5), ha="left", va="center",
                fontsize=8.6, color="#555555", style="italic", zorder=6,
                arrowprops=dict(arrowstyle="->", lw=0.9, color="#888888",
                                connectionstyle="arc3,rad=-0.25"))

    ax.set_xlim(*XL); ax.set_ylim(*YL)
    ax.set_xlabel("log₁₀  B    (binding fraction)", fontsize=12.5)
    ax.set_ylabel("log₁₀  D    (throughput over a Hubble time / binding energy)", fontsize=12.5)
    ax.set_title("Binding depth is not the only way to hold together",
                 fontsize=14.5, fontweight="bold", pad=12)
    ax.grid(alpha=0.16, lw=0.6); ax.set_axisbelow(True)
    fig.tight_layout(); fig.savefig(path, dpi=170); plt.close(fig)


# ---------------------------------------------------------------------------
def main() -> None:
    print("=" * 78)
    print("MSC v0 — binding fraction B across scales")
    print("=" * 78)

    checks = crosschecks()
    failed = [c for c in checks if not c[1]]
    print(f"\nCROSS-CHECKS: {len(checks) - len(failed)}/{len(checks)} passed\n")
    for label, ok, detail in checks:
        if not ok or label.startswith("[ref]") or label.startswith("[nucl]") \
           or label.startswith("[atom]") or label.startswith("[cond]") \
           or label.startswith("[sign]") or label.startswith("[diss]"):
            print(f"  {'PASS' if ok else 'FAIL'}  {label:<52} {detail}")
    print(f"  ...plus {sum(1 for c in checks if c[0].startswith('[grav]') or c[0].startswith('[bh]') or c[0].startswith('[Lam]'))} "
          f"gravitational / ceiling / Lambda identity checks (shown only on failure)")

    print("\n" + write_table())

    print(f"\nDOMAIN BOUNDARY (not plotted):")
    print(f"  Proton from current quarks: sum(m_q)c^2 = {QUARK_REST_MEV:.2f} MeV, "
          f"m_p c^2 = {M_P:.2f} MeV")
    print(f"  B = {PROTON_B:.1f}  -- binding exceeds constituent rest energy; the "
          f"definition inverts.")

    print("\n" + "=" * 78)
    print("IS B MANY-TO-ONE GENERICALLY, OR ARE THESE PAIRS CHERRY-PICKED?")
    print("=" * 78)
    r = collision_stats()
    print(f"  cross-family pairs within 10%   : {r['observed']}  (of {r['total_cross']} cross-family pairs)")
    print(f"  null preserving family ranges   : {r['null'].mean():.2f} +/- {r['null'].std():.2f}  "
          f"(20k draws)")
    print(f"  p(null >= observed)             : {r['p']:.3f}"
          f"   -> {'GENERIC, not a coincidence' if r['p'] > 0.05 else 'in excess of chance'}")
    print("\n  every cross-family pair within 10% (exhaustive, nothing selected):")
    for a, b, d in sorted(r['pairs'], key=lambda x: x[2]):
        dec = abs(math.log10(a.scale_m) - math.log10(b.scale_m))
        print(f"    {a.name:<20}{a.B:.3e}  ==  {b.name:<18}{b.B:.3e}"
              f"   {(10**d - 1) * 100:4.1f}%   {dec:.0f} decades apart")
    lo, hi = r['overlap']
    print(f"\n  chemical and gravitational systems share {hi - lo:.2f} dex of B "
          f"[{10**lo:.2e}, {10**hi:.2e}]")
    print(f"  gravitational systems landing in that band          : {len(r['grav_in'])}")
    print(f"  ...of which have a chemical twin within 10%         : {len(r['twinned'])}"
          f"   ({100 * len(r['twinned']) / max(1, len(r['grav_in'])):.0f}%)")
    print("  B's fibers mix regimes as a matter of course. That is a statement about")
    print("  the dimensionality of the map, not about four lucky pairs.")

    print("\n" + "=" * 78)
    print("ONE SYSTEM, TWO VALUES: B IS NOT SINGLE-VALUED WITHOUT A LEVEL STIPULATION")
    print("=" * 78)
    mg = next(x for x in SYSTEMS if x.name == "Moon")
    mc = next(x for x in SYSTEMS if x.name == "Moon (chemical)")
    print(f"  Moon, gravitational (the body)   B = {mg.B:.3e}")
    print(f"  Moon, chemical (its atoms)       B = {mc.B:.3e}   -> {mc.B / mg.B:.1f}x apart")
    print("  Both are correct. B does not say which one is the Moon's, and no second")
    print("  axis fixes that -- it is a domain ambiguity underneath the degeneracy.")

    print("\n" + "=" * 78)
    print("SIGNED FORM: B' = (sum m_constituents - m_system)/m_system  ==  B/(1-B)")
    print("=" * 78)
    print("  Bounded in (-1, +1] because the compactness ceiling puts B <= 1/2.")
    print("  No divergence at the confinement end; the SIGN carries the regime.")
    for n in ["Helium-4", "Iron-56", "Hydrogen atom", "Diamond", "Earth",
              "Neutron star", "Black hole (10 Msun)"]:
        x = next(y for y in SYSTEMS if y.name == n)
        print(f"    {n:<22} B  = {x.B:+.4e}     B' = {x.B_signed:+.4e}")
    print(f"    {'Proton (uud current)':<22} B  = {PROTON_B:+.4e}     "
          f"B' = {PROTON_B / (1 - PROTON_B):+.4e}   <- was undefined under B")
    print("  Iron: mass deficit, B' > 0.  Proton: binding supplies the mass, B' < 0.")
    print("  Black hole sits exactly at B' = +1. One formula, both regimes.")

    print("\n" + "=" * 78)
    print("DISSIPATION INDEX  D = (throughput over a Hubble time) / (binding energy)")
    print("=" * 78)
    for x in sorted([y for y in SYSTEMS if y.dissipation is not None],
                    key=lambda y: -y.dissipation):
        tau = (x.specific_binding_J_per_kg / x.power_W_per_kg
               if x.power_W_per_kg else float("inf"))
        t = "never" if tau == float("inf") else (
            f"{tau / 3.156e7:.3g} yr" if tau > 3.156e7 else f"{tau / 86400:.2g} d")
        print(f"    {x.name:<22} B = {x.B:.2e}   D = {x.dissipation:.2e}   turnover {t}")
    print("  CAVEAT: D counts all throughput, not throughput the structure depends on.")
    print("  The Moon clears D = 1 on radiogenic heat it would be fine without.")

    make_plot()
    make_plane_plot()
    print("\nWrote msc_v0.png, msc_v0_plane.png, msc_v0_table.txt, msc_v0.csv")

    if failed:
        raise SystemExit(f"\n{len(failed)} CROSS-CHECK(S) FAILED")


if __name__ == "__main__":
    main()
