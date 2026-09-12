/**
 * DDY parsing — one record out of the four.
 *
 * Lifted from `psychrometric-studio/web/src/weather/ddy.ts` and cut to a single
 * condition. That tool wants all four ASHRAE design days because a coil has to
 * be sized against peak dry bulb, peak dew point and peak enthalpy separately.
 * A heating screen wants exactly one: **annual heating, 99.6%, dry bulb.**
 *
 * The regex is deliberately specific. A DDY also contains
 * `Ann Htg Wind 99.6% Condns WS=>MCDB`, and a looser match on "Htg 99.6%" picks
 * it up and quietly reports a **wind speed as a temperature** — a bug that
 * shipped once already on the sibling and is the reason this file matches on
 * the generated object name rather than on the human comment beside it.
 */

export interface HeatingDesignCondition {
  /** The object's own name, kept so a number can be traced to its source. */
  readonly name: string;
  /** °C — the 99.6% heating design dry bulb. */
  readonly dryBulb: number;
  readonly month: number;
  readonly day: number;
}

export interface DdyFile {
  readonly heating: HeatingDesignCondition | null;
  readonly problems: readonly string[];
}

/**
 * `Ann Htg 99.6% Condns DB` and nothing else.
 *
 * Anchored on `condns db` at the end so the wind-speed object — which ends
 * `condns ws=>mcdb` — cannot match.
 */
const HEATING_PATTERN = /htg\s+99\.6%\s+condns\s+db\s*$/i;

/** Split an EnergyPlus object body into trimmed comma-separated fields. */
function fieldsOf(body: string): string[] {
  return body.split(',').map((field) => field.replace(/!.*$/, '').trim());
}

/**
 * Read a numeric field by the comment that labels it.
 *
 * EnergyPlus objects are positional, but DDY files as published carry a `!- `
 * comment naming every field — and matching the name is far more durable than
 * counting commas across EnergyPlus versions that have added fields.
 */
function readNumberByLabel(raw: string, label: string): number | undefined {
  const pattern = new RegExp(`(-?[\\d.]+)\\s*,?\\s*!-\\s*${label}`, 'i');
  const match = pattern.exec(raw);
  if (!match) return undefined;
  const value = Number.parseFloat(match[1]!);
  return Number.isFinite(value) ? value : undefined;
}

export function parseDdy(text: string): DdyFile {
  const objects = [...text.matchAll(/SizingPeriod:DesignDay\s*,([\s\S]*?);/gi)];

  if (objects.length === 0) {
    return { heating: null, problems: ['No design days were found in this file.'] };
  }

  for (const object of objects) {
    const raw = object[1]!;
    const name = fieldsOf(raw)[0] ?? '';
    if (!HEATING_PATTERN.test(name.trim())) continue;

    /*
     * The heating design day stores its temperature in "Maximum Dry-Bulb
     * Temperature" with a daily range of zero — the ASHRAE convention is a
     * flat day, because equipment is sized against a steady worst case. So the
     * maximum IS the design condition here, which reads wrong and is right.
     */
    const dryBulb = readNumberByLabel(raw, 'Maximum Dry-Bulb Temperature');
    if (dryBulb === undefined) {
      return { heating: null, problems: ['The heating design day carries no dry-bulb temperature.'] };
    }

    return {
      heating: {
        name: name.trim(),
        dryBulb,
        month: readNumberByLabel(raw, 'Month') ?? 0,
        day: readNumberByLabel(raw, 'Day of Month') ?? 0,
      },
      problems: [],
    };
  }

  return {
    heating: null,
    problems: ['This file has no annual heating 99.6% dry-bulb condition.'],
  };
}
