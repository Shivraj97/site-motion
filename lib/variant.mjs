// Variants: the same concept doing a different job on the page. The 100 scenes are unique concepts; a variant is extra
// depth under one of them and never counts toward the 100 (see 004-inspiration/RELEASE-PLAN.md).
//
// A variant is a normal scene folder named `<parent>--<idea>` whose meta.json says:
//   "variantOf": "<parent>"                 an existing concept, not itself a variant
//   "role": "hero"                          the planner role it is built for (VARIANT_ROLES)
//   "differs": { "layout": "…", "moment": "…" }   at least two of DIFFERS_AXES, one line each on what changed
// Stories come from the parent (a variant tells the same story), so a variant doesn't set its own.
// A colour or style swap is never a variant: that is what style packs are for.

export const VARIANT_ROLES = ["hero", "feature", "proof", "story", "cta", "pricing", "trust", "metrics"];
export const DIFFERS_AXES = {
  mechanic: "what moves and why",
  layout: "composition, scale and focal point",
  data: "the data shape: a count, a share, a trend, a path, a comparison",
  renderer: "the renderer, e.g. SVG → Canvas 2D",
  moment: "the signature moment the scene is remembered for",
};
export const MIN_DIFFERS = 2;

export const isVariant = (meta) => !!(meta && meta.variantOf);
export const parentOf = (name) => (name.includes("--") ? name.slice(0, name.indexOf("--")) : null);

// findings in lint's shape. readMeta(name) returns another scene's meta.json, or null if there is no such scene.
export function variantFindings(name, meta, readMeta) {
  const out = [];
  const add = (rule, message, text = "") => out.push({ rule, file: "meta.json", line: 1, text, message });
  const folderParent = parentOf(name);
  if (!isVariant(meta)) {
    if (folderParent) add("variant-meta", `the folder name says this is a variant of "${folderParent}", but meta.json has no "variantOf"`);
    return out;
  }
  const parent = meta.variantOf;
  if (!(name.startsWith(`${parent}--`) && name.length > parent.length + 2)) add("variant-name", `a variant of "${parent}" lives in a folder named "${parent}--<idea>"`, name);
  const pmeta = readMeta(parent);
  if (!pmeta) add("variant-parent", `"variantOf" names "${parent}", which is not a scene`, parent);
  else if (isVariant(pmeta)) add("variant-parent", `"${parent}" is itself a variant of "${pmeta.variantOf}": hang variants off the concept`, parent);
  if (!VARIANT_ROLES.includes(meta.role)) add("variant-role", `"role" must be one of ${VARIANT_ROLES.join(", ")}`, String(meta.role ?? ""));
  const differs = meta.differs && typeof meta.differs === "object" && !Array.isArray(meta.differs) ? meta.differs : null;
  if (!differs) add("variant-differs", `"differs" is an object: at least ${MIN_DIFFERS} of ${Object.keys(DIFFERS_AXES).join(", ")}, each with one line on what changed`);
  else {
    const unknown = Object.keys(differs).filter((k) => !(k in DIFFERS_AXES));
    if (unknown.length) add("variant-differs", `"differs" has ${unknown.join(", ")}; the axes are ${Object.keys(DIFFERS_AXES).join(", ")}`, unknown.join(", "));
    const said = Object.entries(differs).filter(([k, v]) => k in DIFFERS_AXES && typeof v === "string" && v.trim().length >= 8);
    if (said.length < MIN_DIFFERS) add("variant-differs", `a variant changes at least ${MIN_DIFFERS} axes and says how, in a line each (has ${said.length}); a colour or style swap is not a variant`);
  }
  if (meta.story || meta.stories) add("variant-stories", `a variant tells its parent's story: drop "story"/"stories" (they come from "${parent}")`);
  return out;
}

// a variant's meta with what it inherits from its parent filled in (stories, and home look if it sets none)
export function withParent(meta, pmeta) {
  if (!isVariant(meta) || !pmeta) return meta;
  return { ...meta, story: pmeta.story, stories: pmeta.stories || [pmeta.story].filter(Boolean), home: meta.home || pmeta.home };
}
