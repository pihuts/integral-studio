/**
 * Method equations shown in the worked solution.
 * Prefers method from PreparedProblem; falls back to problem fields without re-materializing.
 */

/**
 * @param {object} problem
 * @param {{ alternate?: boolean, topic?: string, method?: string }} [opts]
 */
export function equationsForProblem(problem, { alternate = false, topic = "", method: methodOpt } = {}) {
  if (Array.isArray(problem?.equations) && problem.equations.length) {
    return problem.equations;
  }
  const prepared = problem?._prepared;
  const method =
    methodOpt ||
    prepared?.method(alternate) ||
    problem?.visualParams?.method ||
    problem?.visualSpec?.method ||
    problem?.visual ||
    topic ||
    "";
  const m = String(method).toLowerCase();
  if (topic === "fundamentals" || m.includes("fund")) {
    return [
      "\\int x^{n}\\,dx=\\frac{x^{n+1}}{n+1}+C\\quad(n\\neq-1)",
      "\\int\\big(f+g\\big)\\,dx=\\int f\\,dx+\\int g\\,dx",
      "\\int c\\,f(x)\\,dx=c\\int f(x)\\,dx"
    ];
  }
  if (m.startsWith("shell")) {
    return [
      "V=2\\pi\\int_a^b(\\text{radius})(\\text{height})\\,dx",
      "dV=2\\pi\\,r\\,h\\,dx"
    ];
  }
  if (m.startsWith("washer")) {
    return [
      "V=\\pi\\int_a^b\\Big(R_{\\text{outer}}^{2}-R_{\\text{inner}}^{2}\\Big)\\,dx",
      "dV=\\pi\\big(R_{\\text{out}}^{2}-R_{\\text{in}}^{2}\\big)\\,dx"
    ];
  }
  if (m.startsWith("disk")) {
    return [
      "V=\\pi\\int_a^b\\big[R(x)\\big]^{2}\\,dx",
      "dV=\\pi R^{2}\\,dx"
    ];
  }
  if (m.startsWith("surface") || topic === "surface") {
    return [
      "S=2\\pi\\int_a^b y\\sqrt{1+[y']^{2}}\\,dx\\quad(\\text{about }x\\text{-axis})",
      "dS=2\\pi\\,(\\text{radius})\\,ds"
    ];
  }
  if (m === "arc" || topic === "arc" || problem?.visual === "curve") {
    return [
      "L=\\int_a^b\\sqrt{1+[f'(x)]^{2}}\\,dx",
      "ds=\\sqrt{1+[y']^{2}}\\,dx"
    ];
  }
  if (topic === "centroids" || problem?.visual === "centroid") {
    return [
      "A=\\int_a^b f(x)\\,dx",
      "\\bar{x}=\\frac{1}{A}\\int_a^b x f(x)\\,dx",
      "\\bar{y}=\\frac{1}{A}\\int_a^b\\frac{1}{2}[f(x)]^{2}\\,dx"
    ];
  }
  if (topic === "inertia" || problem?.visual === "inertia") {
    return [
      "I_x=\\int_a^b\\frac{[f(x)]^{3}}{3}\\,dx\\quad(\\text{vertical strip})",
      "I_y=\\int_a^b x^{2} f(x)\\,dx\\quad(\\text{about }y\\text{-axis})"
    ];
  }
  if (topic === "applications") {
    return [
      "W=\\int_a^b F(x)\\,dx",
      "F_{\\text{spring}}=kx,\\quad W=\\tfrac12 k x^{2}"
    ];
  }
  if (topic === "area" || m === "area" || problem?.visual === "area") {
    return [
      "A=\\int_a^b\\big[f_{\\text{top}}(x)-f_{\\text{bottom}}(x)\\big]\\,dx",
      "\\int_a^b f(x)\\,dx=F(b)-F(a)"
    ];
  }
  if (topic === "volumes") {
    return [
      "V=\\pi\\int R^{2}\\,dx\\quad(\\text{disk/washer})",
      "V=2\\pi\\int r h\\,dx\\quad(\\text{shell})"
    ];
  }
  return ["\\text{total}=\\int(\\text{slice amount})"];
}
