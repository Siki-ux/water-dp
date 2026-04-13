/**
 * Curated catalog of common SaQC quality control functions.
 *
 * Each entry describes the function name (exact SaQC name), a display label,
 * a short description, and the parameters users can configure.
 * This powers the auto-generated parameter form in QAQCTestEditor.
 *
 * Reference: https://rdm-software.github.io/saqc/
 */

export type ParamType = "number" | "string" | "boolean" | "integer";

export interface FunctionParam {
    name: string;
    type: ParamType;
    required: boolean;
    default?: string | number | boolean;
    description: string;
    placeholder?: string;
}

export interface SaQCFunction {
    name: string;
    label: string;
    description: string;
    /** Longer explanation shown when the function is selected in the UI */
    whenToUse: string;
    category: "range" | "outlier" | "pattern" | "missing" | "custom";
    params: FunctionParam[];
}

export const SAQC_FUNCTIONS: SaQCFunction[] = [
    {
        name: "flagRange",
        label: "Range Check",
        description: "Flag values outside a defined [min, max] boundary.",
        whenToUse:
            "Use this as your first test. It catches physically impossible readings — e.g. a water level sensor reporting −50 m or 999 m. " +
            "Set min/max to the widest plausible bounds for your measurement type. " +
            "Values that exceed these bounds are almost certainly sensor errors, not real events.",
        category: "range",
        params: [
            { name: "min", type: "number", required: false, description: "Lower bound — values strictly below this are flagged (e.g. −2 for water level in metres)" },
            { name: "max", type: "number", required: false, description: "Upper bound — values strictly above this are flagged (e.g. 20 for water level in metres)" },
        ],
    },
    {
        name: "flagMAD",
        label: "Median Absolute Deviation",
        description: "Flag values that deviate from the rolling median by more than z standard deviations (MAD-based).",
        whenToUse:
            "Good all-purpose outlier detector. Unlike mean/std, the median is resistant to the very outliers you're trying to find, " +
            "so it works well on noisy sensor streams. Use a generous window (30d) and moderate z (3–4) to catch genuine spikes " +
            "without false-flagging natural variation. Run this after flagRange.",
        category: "outlier",
        params: [
            { name: "window", type: "string", required: true, default: "30d", description: "Rolling window for median calculation (e.g. '30d', '7d'). Longer = more stable baseline.", placeholder: "30d" },
            { name: "z", type: "number", required: false, default: 3.5, description: "Sensitivity: how many MAD-derived SDs away from the median triggers a flag. Lower = stricter." },
        ],
    },
    {
        name: "flagConstants",
        label: "Stuck Sensor / Constants",
        description: "Flag consecutive identical values (stuck sensor or transmission errors).",
        whenToUse:
            "Sensors sometimes freeze on one value due to cable faults, power issues, or logging bugs. " +
            "A river level that reads exactly 1.230 m for 12 hours without any change is almost certainly stuck, not real. " +
            "Set window to a time period over which truly constant values are implausible for your measurement.",
        category: "pattern",
        params: [
            { name: "window", type: "string", required: true, default: "12h", description: "Minimum duration of an unbroken constant stretch to flag (e.g. '12h', '6h', '1h')", placeholder: "12h" },
            { name: "thresh", type: "number", required: false, default: 0, description: "Maximum variance still considered 'constant'. Set > 0 to tolerate tiny numeric noise." },
        ],
    },
    {
        name: "flagIsolated",
        label: "Isolated Points",
        description: "Flag isolated single observations surrounded by gaps or flagged values.",
        whenToUse:
            "Single readings that appear in isolation — with large gaps on both sides — are suspicious because " +
            "valid sensor readings usually come in a continuous stream. Useful for catching transmission glitches " +
            "where a single value arrives alone and cannot be contextualised.",
        category: "outlier",
        params: [
            { name: "window", type: "string", required: true, default: "1h", description: "Minimum gap before AND after the isolated point for it to be flagged (e.g. '1h')", placeholder: "1h" },
            { name: "group_window", type: "string", required: false, default: "1min", description: "Maximum spacing between consecutive points to be counted as the same 'group'", placeholder: "1min" },
        ],
    },
    {
        name: "flagDriftFromNorm",
        label: "Drift from Reference",
        description: "Flag values that drift significantly from a reference stream or historical norm.",
        whenToUse:
            "Sensors can drift gradually over weeks/months due to biofouling, calibration shift, or battery issues. " +
            "This test computes a historical norm and flags when readings deviate beyond spread. " +
            "Works best on sensors with a stable long-term baseline. Not suitable for rivers with strong seasonal patterns " +
            "unless you account for seasonality in the norm.",
        category: "outlier",
        params: [
            { name: "window", type: "string", required: true, default: "30d", description: "Rolling window for computing the reference norm (e.g. '30d')", placeholder: "30d" },
            { name: "spread", type: "number", required: false, default: 0.5, description: "Maximum allowed relative deviation from the norm (0.5 = 50%)" },
        ],
    },
    {
        name: "flagMissing",
        label: "Missing Values",
        description: "Flag NaN / missing observations.",
        whenToUse:
            "Always include this as one of your tests — it makes missing data visible in quality reports " +
            "rather than silently absent. Typically run first so downstream tests see that gaps are already annotated. " +
            "Missing values can indicate a sensor going offline, network issues, or data pipeline failures.",
        category: "missing",
        params: [],
    },
    {
        name: "flagZScore",
        label: "Z-Score Outlier",
        description: "Flag values whose Z-score exceeds a threshold within a rolling window.",
        whenToUse:
            "Alternative to flagMad for streams that are approximately normally distributed. " +
            "Z-score is more sensitive to outliers than MAD but also more easily skewed by extreme values. " +
            "Use flagMad if your stream has heavy tails or frequent spikes. Use flagZScore for cleaner, near-Gaussian data.",
        category: "outlier",
        params: [
            { name: "window", type: "string", required: true, default: "30d", description: "Rolling window for mean/std calculation (e.g. '30d', '7d')", placeholder: "30d" },
            { name: "thresh", type: "number", required: false, default: 3.0, description: "Z-score threshold — values above this are flagged. 3.0 flags ~0.3% of a normal distribution." },
        ],
    },
    {
        name: "flagByClick",
        label: "Manual Flag (by time range)",
        description: "Manually flag a specific time range (useful for known outages).",
        whenToUse:
            "Use this when you know that a sensor was offline, being serviced, or affected by a known external event " +
            "(e.g. construction work nearby, flooding that knocked out equipment). This lets you explicitly mark " +
            "a time range as bad data without relying on automated detection.",
        category: "custom",
        params: [
            { name: "start", type: "string", required: true, description: "Start of the time range to flag (ISO 8601)", placeholder: "2024-01-01T00:00:00" },
            { name: "end", type: "string", required: true, description: "End of the time range to flag (ISO 8601)", placeholder: "2024-01-02T00:00:00" },
        ],
    },
];

/** Look up a function definition by SaQC function name. */
export function getSaQCFunction(name: string): SaQCFunction | undefined {
    return SAQC_FUNCTIONS.find((f) => f.name === name);
}

/** The "Custom" sentinel used in the UI when selecting a raw function name. */
export const CUSTOM_FUNCTION_SENTINEL = "__custom__";
