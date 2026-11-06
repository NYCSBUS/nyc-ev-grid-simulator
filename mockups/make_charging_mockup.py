"""
Builds ConEd_EV_Charging_Impact_Mock.xlsx — a synthetic charging-session dataset
with Con Edison program enrollment, laid out so an analyst can see whether the
incentives move charging out of the peak window.

All data is invented. Program rules and $ figures are illustrative only.
Run:  python3 make_charging_mockup.py
"""
from __future__ import annotations

import random
from collections import defaultdict
from datetime import datetime, timedelta, date

from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

random.seed(7)

START, END = date(2026, 4, 1), date(2026, 9, 30)
DAYS = [START + timedelta(d) for d in range((END - START).days + 1)]
MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]
SUMMER = {6, 7, 8, 9}  # Con Ed summer peak season

# --- illustrative tariff / incentive assumptions ---------------------------------
FLAT_RATE = 0.30            # $/kWh, bundled residential supply+delivery (illustrative)
TOU_OFFPEAK, TOU_PEAK = 0.11, 0.34  # EV TOU rate: off-peak midnight–8 AM
SC_OFFPEAK_SUMMER, SC_OFFPEAK_OTHER = 0.10, 0.05  # SmartCharge NY $/kWh, midnight–8 AM
SC_PEAK_FREE_BONUS = 20.0   # $/summer month with no weekday 2–6 PM charging
FLEET_DEMAND_CHARGE = 25.0  # $/kW-month on monthly max kW (illustrative)
FLEET_RATE = 0.18           # $/kWh commercial energy (illustrative)

BOROUGHS = {
    "Manhattan": (["Yorkville", "Lenox Hill", "Chelsea", "Washington Hts"], 0.18),
    "Bronx": (["Mott Haven", "Fordham", "Pelham", "Riverdale"], 0.22),
    "Brooklyn": (["Park Slope", "Bay Ridge", "Flatbush", "Williamsburg"], 0.28),
    "Queens": (["Jackson Hts", "Flushing", "Astoria", "Jamaica"], 0.26),
    "Westchester": (["Yonkers", "White Plains", "New Rochelle"], 0.06),
}
DAC_RATE = {"Manhattan": 0.25, "Bronx": 0.7, "Brooklyn": 0.45, "Queens": 0.4, "Westchester": 0.15}
VEHICLES = ["Tesla Model Y", "Tesla Model 3", "Chevy Equinox EV", "Hyundai Ioniq 5", "Ford Mustang Mach-E",
            "Kia EV6", "Nissan Leaf", "Toyota bZ4X", "VW ID.4", "Rivian R1S"]
FLEET_VEHICLES = ["Ford E-Transit", "BrightDrop Zevo", "Rivian EDV", "Lion6 box truck"]


def pick_borough():
    r = random.random()
    acc = 0
    for b, (_, w) in BOROUGHS.items():
        acc += w
        if r <= acc:
            return b
    return "Queens"


# --- customers --------------------------------------------------------------------
# segment, count, program mix: (program, share)
SEGMENTS = [
    ("Residential (single-family)", 70, [("SmartCharge NY", 0.40), ("EV time-of-use rate", 0.20), ("None (control)", 0.40)]),
    ("Multifamily garage", 36, [("SmartCharge NY", 0.45), ("None (control)", 0.55)]),
    ("Fleet depot", 10, [("Fleet managed charging", 0.6), ("None (control)", 0.4)]),
    ("Public DC fast site", 8, [("PowerReady (make-ready only)", 1.0)]),
]

customers = []
cid = 1000
for seg, n, mix in SEGMENTS:
    for _ in range(n):
        cid += 1
        b = pick_borough()
        r, acc, prog = random.random(), 0, mix[-1][0]
        for p, w in mix:
            acc += w
            if r <= acc:
                prog = p
                break
        is_fleet = seg == "Fleet depot"
        is_dcfc = seg == "Public DC fast site"
        kw = 150 if is_dcfc else (19.2 if is_fleet else random.choice([7.2, 7.2, 9.6, 11.5]))
        # staggered enrollment so every enrolled customer has a before and an after.
        # Controls get a matched pseudo-date so a difference-in-differences is clean.
        enroll = date(2026, 5, 1) + timedelta(days=random.randint(0, 75))
        customers.append(dict(
            id=f"C{cid}", segment=seg, borough=b, network=random.choice(BOROUGHS[b][0]),
            dac="Yes" if random.random() < DAC_RATE[b] else "No",
            program=prog, enrolled=None if is_dcfc else enroll,
            treated=prog not in ("None (control)", "PowerReady (make-ready only)"),
            charger_kw=kw, ports=random.choice([4, 6, 8]) if is_dcfc else (random.choice([4, 6, 8]) if is_fleet else 1),
            vehicle=("—" if is_dcfc else random.choice(FLEET_VEHICLES if is_fleet else VEHICLES)),
            derate_kw=10.0 if (is_fleet and prog == "Fleet managed charging") else None,
            compliance=random.uniform(0.7, 0.95),  # share of sessions actually shifted once enrolled
        ))

# --- hour-of-day start distributions ----------------------------------------------
def weights(peaks):
    w = [0.3] * 24
    for h, amp, width in peaks:
        for x in range(24):
            d = min(abs(x - h), 24 - abs(x - h))
            w[x] += amp * max(0.0, 1 - d / width)
    return w

W_RES_UNMANAGED = weights([(18, 6, 4), (22, 2, 2), (8, 1.2, 2), (13, 1.0, 3)])
W_RES_SHIFTED = weights([(1, 8, 3)])          # timer set for after midnight
W_FLEET_UNMANAGED = weights([(17, 8, 2.5)])   # vans return and plug straight in
W_FLEET_MANAGED = weights([(23, 4, 2), (2, 4, 3)])
W_DCFC = weights([(12, 4, 4), (17, 5, 3), (9, 2, 2)])


def draw_hour(w):
    h = random.choices(range(24), weights=w)[0]
    return h + random.random()


def split_kwh(start: datetime, hours: float, kw: float):
    """Return kWh by clock hour for a constant-power session."""
    out = defaultdict(float)
    t, remaining = start, hours
    while remaining > 1e-9:
        nxt = (t.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1))
        step = min(remaining, (nxt - t).total_seconds() / 3600)
        out[(t.date(), t.hour)] += step * kw
        t += timedelta(hours=step)
        remaining -= step
    return out


def in_peak_window(d: date, h: int):
    # Con Ed's summer peak window is weekdays 2–6 PM. Measured year-round so the
    # before-enrollment months (Apr–May) compare like-for-like with the after months.
    return d.weekday() < 5 and 14 <= h < 18


# --- sessions --------------------------------------------------------------------
sessions = []
sid = 0
fleet_hourly = defaultdict(float)  # (customer, date, hour) -> kW, to derive depot peaks

for c in customers:
    seg, prog = c["segment"], c["program"]
    for d in DAYS:
        phase_after = c["enrolled"] is not None and d >= c["enrolled"]
        if seg == "Public DC fast site":
            n = random.randint(1, 3) + c["ports"] // 4
            for _ in range(n):
                sid += 1
                kwh = round(random.uniform(18, 55), 1)
                kw = random.uniform(70, 140)
                st = datetime.combine(d, datetime.min.time()) + timedelta(hours=draw_hour(W_DCFC))
                sessions.append((sid, c, st, kwh, kw, "n/a"))
            continue

        if seg == "Fleet depot":
            n = sum(random.random() < 0.75 for _ in range(c["ports"])) if d.weekday() < 5 else random.randint(0, 1)
            managed = prog == "Fleet managed charging" and phase_after
            for _ in range(n):
                sid += 1
                kwh = round(random.uniform(35, 80), 1)
                kw = c["derate_kw"] if managed else c["charger_kw"]
                st = datetime.combine(d, datetime.min.time()) + timedelta(hours=draw_hour(W_FLEET_MANAGED if managed else W_FLEET_UNMANAGED))
                sessions.append((sid, c, st, kwh, kw, "Managed" if managed else "Unmanaged"))
            continue

        # residential / multifamily: ~4 sessions a week
        if random.random() > 0.57:
            continue
        sid += 1
        kwh = round(random.uniform(9, 42), 1)
        kw = c["charger_kw"]
        shifted = c["treated"] and phase_after and random.random() < c["compliance"]
        if prog == "EV time-of-use rate":
            shifted = shifted and random.random() < 0.85  # price signal a little weaker than a cash reward
        st = datetime.combine(d, datetime.min.time()) + timedelta(hours=draw_hour(W_RES_SHIFTED if shifted else W_RES_UNMANAGED))
        sessions.append((sid, c, st, kwh, kw, "Shifted" if shifted else "Unmanaged"))

sessions.sort(key=lambda s: s[2])

# --- derive per-session metrics ---------------------------------------------------
rows = []
monthly = defaultdict(lambda: dict(sessions=0, kwh=0.0, off=0.0, peak=0.0, five=0.0, incentive=0.0, cost=0.0, flat_cost=0.0))
hourly_profile = defaultdict(lambda: [0.0] * 24)  # phase -> kWh per hour
hourly_days = defaultdict(set)

for i, (sid_, c, st, kwh, kw, mode) in enumerate(sessions, 1):
    hours = kwh / kw
    en = st + timedelta(hours=hours)
    parts = split_kwh(st, hours, kw)
    off = sum(v for (dd, h), v in parts.items() if h < 8)
    peak = sum(v for (dd, h), v in parts.items() if in_peak_window(dd, h))
    five = sum(v for (dd, h), v in parts.items() if h == 17)
    d = st.date()
    month = f"{d.year}-{d.month:02d}"
    prog = c["program"]
    if c["enrolled"] is None:
        phase = "Public DCFC (no behavioural program)"
    elif c["treated"]:
        phase = "Enrolled – after" if d >= c["enrolled"] else "Enrolled – before"
    else:
        phase = "Control – after" if d >= c["enrolled"] else "Control – before"

    # $ under the customer's actual arrangement
    if c["segment"] == "Fleet depot":
        cost = kwh * FLEET_RATE
        flat = cost
    elif prog == "EV time-of-use rate" and d >= c["enrolled"]:
        cost = off * TOU_OFFPEAK + (kwh - off) * TOU_PEAK
        flat = kwh * FLAT_RATE
    elif c["segment"] == "Public DC fast site":
        cost = kwh * 0.45
        flat = cost
    else:
        cost = flat = kwh * FLAT_RATE
    incentive = 0.0
    if prog == "SmartCharge NY" and d >= c["enrolled"]:
        incentive = off * (SC_OFFPEAK_SUMMER if d.month in SUMMER else SC_OFFPEAK_OTHER)

    rows.append([
        f"S{i:06d}", c["id"], c["segment"], c["borough"], c["network"], c["dac"], prog,
        c["enrolled"], phase, mode, c["vehicle"], st, en, round(hours, 2), kwh, round(kw, 1),
        st.hour, st.strftime("%a"), month, "Yes" if (d.month in SUMMER and d.weekday() < 5) else "No",
        round(off, 2), round(peak, 2), round(five, 2),
        round(off / kwh, 3), "Yes" if peak > 0 else "No", round(incentive, 2), round(cost, 2), round(flat, 2),
    ])
    m = monthly[(c["id"], month)]
    m["sessions"] += 1; m["kwh"] += kwh; m["off"] += off; m["peak"] += peak; m["five"] += five
    m["incentive"] += incentive; m["cost"] += cost; m["flat_cost"] += flat
    for (dd, h), v in parts.items():
        hourly_profile[phase][h] += v
        hourly_days[phase].add(dd)
        if c["segment"] == "Fleet depot":
            fleet_hourly[(c["id"], dd, h)] += v  # kWh in an hour == average kW

# SmartCharge peak-free monthly bonus
cust_by_id = {c["id"]: c for c in customers}
for (cid_, month), m in monthly.items():
    c = cust_by_id[cid_]
    y, mo = map(int, month.split("-"))
    if c["program"] == "SmartCharge NY" and mo in SUMMER and date(y, mo, 1) >= c["enrolled"].replace(day=1) and m["peak"] == 0:
        m["bonus"] = SC_PEAK_FREE_BONUS
        m["incentive"] += SC_PEAK_FREE_BONUS
    else:
        m["bonus"] = 0.0

# fleet monthly peak kW
fleet_peak = defaultdict(float)
for (cid_, dd, h), v in fleet_hourly.items():
    k = (cid_, f"{dd.year}-{dd.month:02d}")
    fleet_peak[k] = max(fleet_peak[k], v)

# ===================================================================================
# Workbook
# ===================================================================================
wb = Workbook()
HDR_FILL = PatternFill("solid", fgColor="1F3864")
HDR_FONT = Font(bold=True, color="FFFFFF")
SUB_FILL = PatternFill("solid", fgColor="D9E1F2")
GOOD = PatternFill("solid", fgColor="E2EFDA")
NOTE = Font(italic=True, color="595959")
thin = Side(style="thin", color="BFBFBF")
BOX = Border(top=thin, bottom=thin, left=thin, right=thin)


def header(ws, row, labels, widths=None):
    for j, lab in enumerate(labels, 1):
        cell = ws.cell(row=row, column=j, value=lab)
        cell.fill, cell.font = HDR_FILL, HDR_FONT
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        if widths:
            ws.column_dimensions[get_column_letter(j)].width = widths[j - 1]
    ws.row_dimensions[row].height = 32


def title(ws, text, sub=None):
    ws["A1"] = text
    ws["A1"].font = Font(bold=True, size=14)
    if sub:
        ws["A2"] = sub
        ws["A2"].font = NOTE


# --- Read me ----------------------------------------------------------------------
ws = wb.active
ws.title = "Read me"
ws.column_dimensions["A"].width = 28
ws.column_dimensions["B"].width = 110
title(ws, "Con Edison EV charging sessions — program impact mock-up", "Synthetic data, April–September 2026. Nothing here is a real customer or a real tariff figure.")
readme = [
    ("Purpose", "Show, from session-level charging data, whether Con Ed EV programs move charging out of the summer peak window and what that is worth."),
    ("Question answered", "Do enrolled customers charge less during 2–6 PM on summer weekdays (and more after midnight) than they did before enrolling — and more than similar customers who never enrolled?"),
    ("Method", "Difference-in-differences. Every enrolled customer has sessions before and after an enrollment date. Control customers are given a matched pseudo-date so the same before/after split applies. Impact = (enrolled after − enrolled before) − (control after − control before)."),
    ("", ""),
    ("Programs in the file", ""),
    ("SmartCharge NY", "Residential / multifamily reward: $0.10 per kWh charged midnight–8 AM in June–Sept ($0.05 other months) plus a $20 bonus for each summer month with no weekday 2–6 PM charging. Illustrative values."),
    ("EV time-of-use rate", "Price signal only, no cash reward: $0.11/kWh midnight–8 AM vs $0.34/kWh at other times, against a $0.30 flat rate. Illustrative values."),
    ("Fleet managed charging", "Depot software schedules vans overnight and derates 19.2 kW plugs to 10 kW. Value shows up as a lower monthly peak kW (demand charge, $25/kW-month illustrative)."),
    ("PowerReady (make-ready only)", "Infrastructure funding for public DC fast sites. It is not a behavioural incentive, so these sites are kept out of the impact math and shown for context only."),
    ("None (control)", "Comparable customers with no program."),
    ("", ""),
    ("Key definitions", ""),
    ("Peak window", "Weekdays 2:00–6:00 PM — Con Ed's summer peak window. It is measured in every month so April–May (before) compares like-for-like with June–September (after); the SmartCharge peak-free bonus itself only pays in June–September. A session's kWh is split by clock hour, so only energy that actually lands in the window counts."),
    ("Off-peak", "Midnight–8:00 AM, every day."),
    ("5–6 PM kWh", "Energy delivered in the system rush hour — the number that matters for feeder and transformer loading."),
    ("Phase", "Enrolled – before / Enrolled – after / Control – before / Control – after, relative to the (pseudo-)enrollment date."),
    ("", ""),
    ("Sheets", ""),
    ("Sessions", "One row per charging session (raw data). Everything else is derived from it; the Impact summary uses live SUMIFS formulas against this sheet, so edits flow through."),
    ("Customers", "Account roster with segment, borough, DAC flag, program and enrollment date."),
    ("Impact summary", "The before/after × enrolled/control table, difference-in-differences, per-program breakdown and dollar value."),
    ("Hourly profile", "Average kW by hour of day for each phase — the 'did the evening hump move to after midnight' chart."),
    ("Monthly by customer", "Customer × month roll-up with incentive earned, peak-free bonus and bill vs flat rate."),
    ("Fleet demand", "Depot monthly peak kW before/after managed charging and the demand-charge saving."),
]
for r, (k, v) in enumerate(readme, 4):
    ws.cell(row=r, column=1, value=k).font = Font(bold=True) if v or not k else Font(bold=True, size=12)
    ws.cell(row=r, column=2, value=v).alignment = Alignment(wrap_text=True, vertical="top")

# --- Customers --------------------------------------------------------------------
ws = wb.create_sheet("Customers")
cols = ["Customer ID", "Segment", "Borough", "Network / area", "Disadvantaged community", "Program", "Enrollment date", "Treated?", "Charger kW (hardware)", "Managed cap kW", "Ports", "Vehicle"]
header(ws, 1, cols, [12, 26, 13, 16, 14, 26, 14, 10, 12, 12, 8, 20])
for r, c in enumerate(customers, 2):
    vals = [c["id"], c["segment"], c["borough"], c["network"], c["dac"], c["program"], c["enrolled"], "Yes" if c["treated"] else "No", c["charger_kw"], c["derate_kw"], c["ports"], c["vehicle"]]
    for j, v in enumerate(vals, 1):
        cell = ws.cell(row=r, column=j, value=v)
        if j == 7 and v:
            cell.number_format = "yyyy-mm-dd"
ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{len(customers)+1}"

# --- Sessions ---------------------------------------------------------------------
ws = wb.create_sheet("Sessions")
cols = ["Session ID", "Customer ID", "Segment", "Borough", "Network / area", "DAC", "Program", "Enrollment date", "Phase", "Charging mode", "Vehicle",
        "Start", "End", "Duration (h)", "kWh", "Avg kW", "Start hour", "Weekday", "Month", "Summer peak day?",
        "kWh off-peak (12–8 AM)", "kWh in peak window (2–6 PM)", "kWh 5–6 PM", "Off-peak share", "Touched peak window?", "Incentive earned ($)", "Energy cost ($)", "Cost at flat rate ($)"]
widths = [10, 11, 24, 12, 14, 6, 24, 12, 20, 12, 18, 17, 17, 10, 8, 8, 8, 8, 9, 10, 12, 14, 10, 10, 11, 11, 11, 11]
header(ws, 1, cols, widths)
for r, row in enumerate(rows, 2):
    for j, v in enumerate(row, 1):
        cell = ws.cell(row=r, column=j, value=v)
        if j in (12, 13):
            cell.number_format = "yyyy-mm-dd hh:mm"
        elif j == 8 and v:
            cell.number_format = "yyyy-mm-dd"
        elif j == 24:
            cell.number_format = "0%"
        elif j in (26, 27, 28):
            cell.number_format = "$#,##0.00"
ws.freeze_panes = "C2"
N = len(rows) + 1
ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{N}"

# column letters used by formulas
S = dict(program="G", phase="I", kwh="O", off="U", peak="V", five="W", incentive="Z", cost="AA", flat="AB", segment="C", cust="B", month="S")
def rng(key):
    return f"Sessions!${S[key]}$2:${S[key]}${N}"

# --- Impact summary ---------------------------------------------------------------
ws = wb.create_sheet("Impact summary", 1)
ws.column_dimensions["A"].width = 34
for col in "BCDEFGH":
    ws.column_dimensions[col].width = 16
title(ws, "Did the program change when people charge?", "Live formulas over the Sessions sheet. Public DC fast sites are excluded (no behavioural program). Dollar values use the illustrative assumptions in Read me.")

PHASES = ["Enrolled – before", "Enrolled – after", "Control – before", "Control – after"]
r0 = 4
header(ws, r0, ["Phase", "Sessions", "kWh", "Off-peak share", "Peak-window share (weekday 2–6 PM)", "5–6 PM kWh share", "Sessions touching peak window", "Avg kWh / session"])
for i, ph in enumerate(PHASES):
    r = r0 + 1 + i
    ws.cell(row=r, column=1, value=ph)
    ws.cell(row=r, column=2, value=f'=COUNTIFS({rng("phase")},A{r})')
    ws.cell(row=r, column=3, value=f'=SUMIFS({rng("kwh")},{rng("phase")},A{r})')
    ws.cell(row=r, column=4, value=f'=SUMIFS({rng("off")},{rng("phase")},A{r})/C{r}')
    ws.cell(row=r, column=5, value=f'=SUMIFS({rng("peak")},{rng("phase")},A{r})/C{r}')
    ws.cell(row=r, column=6, value=f'=SUMIFS({rng("five")},{rng("phase")},A{r})/C{r}')
    ws.cell(row=r, column=7, value=f'=COUNTIFS({rng("phase")},A{r},Sessions!$Y$2:$Y${N},"Yes")/B{r}')
    ws.cell(row=r, column=8, value=f"=C{r}/B{r}")
    for col in (4, 5, 6, 7):
        ws.cell(row=r, column=col).number_format = "0.0%"
    ws.cell(row=r, column=3).number_format = "#,##0"
    ws.cell(row=r, column=8).number_format = "0.0"

r = r0 + 6
ws.cell(row=r, column=1, value="Change, enrolled (after − before)").font = Font(bold=True)
ws.cell(row=r + 1, column=1, value="Change, control (after − before)").font = Font(bold=True)
ws.cell(row=r + 2, column=1, value="Program impact (difference-in-differences)").font = Font(bold=True, color="1F3864")
for col in (4, 5, 6, 7):
    L = get_column_letter(col)
    ws.cell(row=r, column=col, value=f"={L}{r0+2}-{L}{r0+1}")
    ws.cell(row=r + 1, column=col, value=f"={L}{r0+4}-{L}{r0+3}")
    ws.cell(row=r + 2, column=col, value=f"={L}{r}-{L}{r+1}")
    for rr in (r, r + 1, r + 2):
        ws.cell(row=rr, column=col).number_format = "+0.0%;-0.0%;0.0%"
    ws.cell(row=r + 2, column=col).fill = GOOD
ws.cell(row=r + 3, column=1, value="Read: a negative peak-window / 5–6 PM number means the program pushed that share of energy out of the rush hour beyond whatever the control group did on its own; a positive off-peak number is energy pulled to after midnight.").font = NOTE

# per-program table
r1 = r + 6
ws.cell(row=r1 - 1, column=1, value="By program").font = Font(bold=True, size=12)
header(ws, r1, ["Program", "Customers", "Sessions (after)", "Peak-window share BEFORE", "Peak-window share AFTER", "Off-peak share BEFORE", "Off-peak share AFTER", "Peak-window change vs control"])
PROGS = ["SmartCharge NY", "EV time-of-use rate", "Fleet managed charging", "None (control)"]
for i, pg in enumerate(PROGS):
    rr = r1 + 1 + i
    bef = f'"*before"'
    aft = f'"*after"'
    ws.cell(row=rr, column=1, value=pg)
    ws.cell(row=rr, column=2, value=f'=COUNTIF(Customers!$F$2:$F${len(customers)+1},A{rr})')
    ws.cell(row=rr, column=3, value=f'=COUNTIFS({rng("program")},A{rr},{rng("phase")},{aft})')
    ws.cell(row=rr, column=4, value=f'=SUMIFS({rng("peak")},{rng("program")},A{rr},{rng("phase")},{bef})/SUMIFS({rng("kwh")},{rng("program")},A{rr},{rng("phase")},{bef})')
    ws.cell(row=rr, column=5, value=f'=SUMIFS({rng("peak")},{rng("program")},A{rr},{rng("phase")},{aft})/SUMIFS({rng("kwh")},{rng("program")},A{rr},{rng("phase")},{aft})')
    ws.cell(row=rr, column=6, value=f'=SUMIFS({rng("off")},{rng("program")},A{rr},{rng("phase")},{bef})/SUMIFS({rng("kwh")},{rng("program")},A{rr},{rng("phase")},{bef})')
    ws.cell(row=rr, column=7, value=f'=SUMIFS({rng("off")},{rng("program")},A{rr},{rng("phase")},{aft})/SUMIFS({rng("kwh")},{rng("program")},A{rr},{rng("phase")},{aft})')
    ctrl = r1 + len(PROGS)
    ws.cell(row=rr, column=8, value=f"=(E{rr}-D{rr})-(E{ctrl}-D{ctrl})")
    for col in (4, 5, 6, 7):
        ws.cell(row=rr, column=col).number_format = "0.0%"
    ws.cell(row=rr, column=8).number_format = "+0.0%;-0.0%;0.0%"
    ws.cell(row=rr, column=8).fill = GOOD

# dollars
r2 = r1 + len(PROGS) + 3
ws.cell(row=r2 - 1, column=1, value="What it is worth (illustrative $)").font = Font(bold=True, size=12)
header(ws, r2, ["Measure", "Value", "", "How computed"])
money = [
    ("SmartCharge NY rewards paid (incl. peak-free bonuses)", f"=SUM('Monthly by customer'!$J$2:$J${len(monthly)+1})", "Sum of monthly incentive column"),
    ("EV TOU customers: bill vs flat rate (negative = saving)", f'=SUMIFS({rng("cost")},{rng("program")},"EV time-of-use rate",{rng("phase")},"Enrolled – after")-SUMIFS({rng("flat")},{rng("program")},"EV time-of-use rate",{rng("phase")},"Enrolled – after")', "Σ TOU cost − Σ flat-rate cost, after enrollment"),
    ("Fleet demand-charge saving", f"=SUM('Fleet demand'!$H$2:$H${len(fleet_peak)+1})", "(before-peak − after-peak kW) × $25 per month, managed depots only"),
    ("Peak-window kWh avoided (enrolled, after)", f'=SUMIFS({rng("kwh")},{rng("phase")},"Enrolled – after")*(E{r0+1}-E{r0+2})', "After-enrollment kWh × drop in peak share"),
    ("5–6 PM kWh avoided (enrolled, after)", f'=SUMIFS({rng("kwh")},{rng("phase")},"Enrolled – after")*(F{r0+1}-F{r0+2})', "After-enrollment kWh × drop in 5–6 PM share"),
]
for i, (k, f, how) in enumerate(money):
    rr = r2 + 1 + i
    ws.cell(row=rr, column=1, value=k)
    ws.cell(row=rr, column=2, value=f).number_format = "$#,##0" if "kWh" not in k else "#,##0 \"kWh\""
    ws.cell(row=rr, column=4, value=how).font = NOTE

# chart: peak-window share by phase
ch = BarChart()
ch.type = "col"
ch.title = "Share of energy in the weekday 2–6 PM peak window"
ch.y_axis.number_format = "0%"
ch.y_axis.title = "share of kWh"
ch.add_data(Reference(ws, min_col=5, min_row=r0, max_row=r0 + 4), titles_from_data=True)
ch.set_categories(Reference(ws, min_col=1, min_row=r0 + 1, max_row=r0 + 4))
ch.height, ch.width = 8, 16
ch.legend = None
ws.add_chart(ch, "J4")

# --- Hourly profile ---------------------------------------------------------------
ws = wb.create_sheet("Hourly profile")
title(ws, "Average kW by hour of day, per phase", "Average across all customer-days in the phase. The evening hump should move to after midnight for 'Enrolled – after'. Fleet and residential pooled; public DCFC shown separately.")
header(ws, 4, ["Hour"] + PHASES + ["Public DCFC (no behavioural program)"], [8] + [18] * 5)
for h in range(24):
    ws.cell(row=5 + h, column=1, value=f"{h:02d}:00")
    for j, ph in enumerate(PHASES + ["Public DCFC (no behavioural program)"], 2):
        days = max(1, len(hourly_days[ph]))
        ws.cell(row=5 + h, column=j, value=round(hourly_profile[ph][h] / days, 2))
lc = LineChart()
lc.title = "Charging load by hour of day"
lc.y_axis.title = "avg kW across the group"
lc.x_axis.title = "hour"
lc.add_data(Reference(ws, min_col=2, max_col=5, min_row=4, max_row=28), titles_from_data=True)
lc.set_categories(Reference(ws, min_col=1, min_row=5, max_row=28))
lc.height, lc.width = 10, 22
ws.add_chart(lc, "H4")

# --- Monthly by customer ----------------------------------------------------------
ws = wb.create_sheet("Monthly by customer")
cols = ["Customer ID", "Month", "Program", "Phase (month start)", "Sessions", "kWh", "Off-peak share", "Peak-window kWh", "Peak-free bonus ($)", "Incentive earned ($)", "Energy cost ($)", "Cost at flat rate ($)", "Saving vs flat ($)"]
header(ws, 1, cols, [12, 9, 24, 18, 9, 9, 10, 12, 11, 12, 11, 12, 11])
r = 2
for (cid_, month) in sorted(monthly):
    m = monthly[(cid_, month)]
    c = cust_by_id[cid_]
    y, mo = map(int, month.split("-"))
    if c["enrolled"] is None:
        ph = "n/a"
    else:
        side = "after" if date(y, mo, 1) >= c["enrolled"].replace(day=1) else "before"
        ph = ("Enrolled" if c["treated"] else "Control") + " – " + side
    vals = [cid_, month, c["program"], ph, m["sessions"], round(m["kwh"], 1), round(m["off"] / m["kwh"], 3), round(m["peak"], 1), m["bonus"], round(m["incentive"], 2), round(m["cost"], 2), round(m["flat_cost"], 2), round(m["flat_cost"] - m["cost"], 2)]
    for j, v in enumerate(vals, 1):
        cell = ws.cell(row=r, column=j, value=v)
        if j == 7:
            cell.number_format = "0%"
        elif j >= 9:
            cell.number_format = "$#,##0.00"
    r += 1
ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:M{r-1}"

# --- Fleet demand -----------------------------------------------------------------
ws = wb.create_sheet("Fleet demand")
cols = ["Depot", "Month", "Program", "Phase", "Ports", "Plug kW in use", "Monthly peak kW", "Demand-charge saving ($)", "kWh"]
header(ws, 1, cols, [10, 9, 24, 18, 7, 12, 14, 16, 10])
base_peak = {}
for (cid_, month) in sorted(fleet_peak):
    c = cust_by_id[cid_]
    y, mo = map(int, month.split("-"))
    after = date(y, mo, 1) >= c["enrolled"].replace(day=1)
    if not after:
        base_peak[cid_] = max(base_peak.get(cid_, 0), fleet_peak[(cid_, month)])
r = 2
for (cid_, month) in sorted(fleet_peak):
    c = cust_by_id[cid_]
    y, mo = map(int, month.split("-"))
    after = date(y, mo, 1) >= c["enrolled"].replace(day=1)
    ph = ("Enrolled" if c["treated"] else "Control") + (" – after" if after else " – before")
    pk = round(fleet_peak[(cid_, month)], 1)
    saving = round(max(0, base_peak.get(cid_, pk) - pk) * FLEET_DEMAND_CHARGE, 0) if (c["treated"] and after) else 0
    vals = [cid_, month, c["program"], ph, c["ports"], c["derate_kw"] if (c["treated"] and after) else c["charger_kw"], pk, saving, round(monthly[(cid_, month)]["kwh"], 0)]
    for j, v in enumerate(vals, 1):
        ws.cell(row=r, column=j, value=v)
    ws.cell(row=r, column=8).number_format = "$#,##0"
    r += 1
ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:I{r-1}"
# pivot-style view for a chart: avg monthly peak kW by month, managed vs control
ws.cell(row=1, column=11, value="Month").font = HDR_FONT
ws.cell(row=1, column=11).fill = HDR_FILL
ws.cell(row=1, column=12, value="Avg peak kW – managed depots").font = HDR_FONT
ws.cell(row=1, column=12).fill = HDR_FILL
ws.cell(row=1, column=13, value="Avg peak kW – control depots").font = HDR_FONT
ws.cell(row=1, column=13).fill = HDR_FILL
for col in "KLM":
    ws.column_dimensions[col].width = 26
for i, m in enumerate(MONTHS):
    rr = 2 + i
    ws.cell(row=rr, column=11, value=m)
    ws.cell(row=rr, column=12, value=f'=AVERAGEIFS($G$2:$G${r-1},$B$2:$B${r-1},K{rr},$C$2:$C${r-1},"Fleet managed charging")').number_format = "0"
    ws.cell(row=rr, column=13, value=f'=AVERAGEIFS($G$2:$G${r-1},$B$2:$B${r-1},K{rr},$C$2:$C${r-1},"None (control)")').number_format = "0"
bc = BarChart()
bc.type = "col"
bc.title = "Depot monthly peak kW (enrollment staggered May–Jul)"
bc.add_data(Reference(ws, min_col=12, max_col=13, min_row=1, max_row=7), titles_from_data=True)
bc.set_categories(Reference(ws, min_col=11, min_row=2, max_row=7))
bc.height, bc.width = 8, 16
ws.add_chart(bc, "K10")

out = "ConEd_EV_Charging_Impact_Mock.xlsx"
wb.save(out)

# --- console sanity check (same math as the sheet formulas) -------------------------
agg = defaultdict(lambda: [0, 0.0, 0.0, 0.0, 0.0])
for row in rows:
    a = agg[row[8]]
    a[0] += 1; a[1] += row[14]; a[2] += row[20]; a[3] += row[21]; a[4] += row[22]
print(f"wrote {out}: {len(customers)} customers, {len(rows)} sessions")
for ph in PHASES:
    n, kwh, off, peak, five = agg[ph]
    print(f"  {ph:18s} n={n:5d} kWh={kwh:9.0f} off={off/kwh:5.1%} peak={peak/kwh:5.1%} 5pm={five/kwh:5.1%}")
