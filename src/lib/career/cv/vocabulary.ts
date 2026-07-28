/**
 * The closed vocabulary the CV reader is allowed to recognise.
 *
 * Deliberately a finite, hand-kept list rather than a generated taxonomy or a
 * "skill" guessed from any capitalised noun. A term is only reported when the
 * document literally contains it, so every skill shown back to the owner is
 * quotable from their own CV. Nothing here is inferred, expanded to synonyms
 * the document does not use, or ranked by an opaque weight.
 *
 * `aliases` exist only for spellings of the same term ("node.js" / "nodejs"),
 * never for related-but-different skills.
 */
export interface VocabularyTerm {
  /** What the owner is shown, and what is matched against a job posting. */
  label: string;
  /** Literal spellings that count as this term appearing. */
  aliases: readonly string[];
}

function term(label: string, ...aliases: string[]): VocabularyTerm {
  return { label, aliases: [label.toLowerCase(), ...aliases] };
}

/**
 * Whole-term containment.
 *
 * Substring matching is not good enough for a claim about what a document
 * says: "SQL" occurs inside "PostgreSQL" and "R" occurs inside every other
 * word, and either would put a skill in front of someone that their CV never
 * named. Word boundaries are only demanded where the term actually ends in a
 * word character — "node.js" is followed by punctuation or a space, never a
 * boundary.
 */
export function containsTerm(haystack: string, needle: string): boolean {
  const escaped = needle.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const leading = /^[a-z0-9]/u.test(needle) ? String.raw`\b` : "";
  const trailing = /[a-z0-9]$/u.test(needle) ? String.raw`\b` : "";
  return new RegExp(`${leading}${escaped}${trailing}`, "u").test(haystack);
}

export const SKILL_VOCABULARY: readonly VocabularyTerm[] = [
  // Engineering
  term("JavaScript", "javascript", "java script"),
  term("TypeScript"),
  term("Python"),
  term("Java"),
  term("C#", "c sharp"),
  term("PHP"),
  term("Ruby"),
  // No bare "go": the word is far too common in ordinary prose for its
  // presence to be evidence that a document names the language.
  { label: "Go", aliases: ["golang", "go developer", "go engineer"] },
  term("Rust"),
  term("Kotlin"),
  term("Swift"),
  term("React", "react.js", "reactjs"),
  term("Next.js", "nextjs", "next js"),
  term("Vue", "vue.js", "vuejs"),
  term("Angular"),
  term("Node.js", "nodejs", "node js"),
  term("Django"),
  term("Laravel"),
  term("Spring Boot"),
  term(".NET", "dotnet", "asp.net"),
  term("SQL"),
  term("PostgreSQL", "postgres"),
  term("MySQL"),
  term("MongoDB"),
  term("Redis"),
  term("GraphQL"),
  term("REST API", "rest apis", "restful api"),
  term("Docker"),
  term("Kubernetes", "k8s"),
  term("AWS", "amazon web services"),
  term("Azure"),
  term("Google Cloud", "gcp"),
  term("Terraform"),
  term("CI/CD", "ci cd", "continuous integration"),
  term("Git"),
  term("Linux"),
  term("Flutter"),
  term("React Native"),
  term("Android"),
  term("iOS"),

  // Data and analysis
  term("Data Analysis", "data analytics"),
  term("Machine Learning"),
  term("Power BI", "powerbi"),
  term("Tableau"),
  term("Excel", "microsoft excel"),
  // A bare "R" cannot be told apart from an initial or a stray letter, so the
  // language is only recognised where the document spells it out.
  { label: "R", aliases: ["r programming", "r language", "rstudio"] },
  term("Pandas"),
  term("Statistics"),
  term("ETL"),
  term("Data Engineering"),

  // Design and product
  term("Figma"),
  term("UI Design", "user interface design"),
  term("UX Research", "user research"),
  term("Product Management"),
  term("Agile"),
  term("Scrum"),
  term("Jira"),
  term("Roadmapping", "product roadmap"),

  // Finance, accounting and compliance
  term("Accounting"),
  term("Financial Reporting"),
  term("IFRS"),
  term("Audit", "auditing"),
  term("Tax", "taxation"),
  term("Payroll"),
  term("QuickBooks"),
  term("SAP"),
  term("Financial Modelling", "financial modeling"),
  term("Risk Management"),
  term("Compliance"),
  term("AML", "anti-money laundering"),

  // Commercial
  term("Sales"),
  term("Business Development"),
  term("Account Management"),
  term("Customer Success"),
  term("Digital Marketing"),
  term("SEO"),
  term("Content Marketing"),
  term("Social Media Management"),
  term("CRM"),
  term("Salesforce"),
  term("HubSpot"),
  term("Market Research"),

  // Operations, people and programmes
  term("Project Management"),
  term("PMP"),
  term("Supply Chain"),
  term("Logistics"),
  term("Procurement"),
  term("Recruitment"),
  term("Human Resources", "hr management"),
  term("Training and Development", "learning and development"),
  term("Monitoring and Evaluation", "m&e"),
  term("Grant Writing"),
  term("Programme Management", "program management"),
  term("Stakeholder Engagement"),
  term("Community Mobilisation", "community mobilization"),
  term("Public Health"),
  term("Humanitarian Response"),

  // Communication
  term("Report Writing"),
  term("Technical Writing"),
  term("Copywriting"),
  term("Public Speaking"),
  term("French"),
  term("Hausa"),
  term("Yoruba"),
  term("Igbo"),
];

/**
 * Words that make a line read as a job title rather than as a person's name.
 *
 * A CV's top lines are a name, a role and contact details in some order, and
 * nothing in the text marks which is which. Rather than assume a position, a
 * headline is only proposed for a line that actually contains a role word —
 * otherwise nothing is proposed and the owner writes their own.
 */
export const ROLE_NOUNS: readonly string[] = [
  "engineer",
  "developer",
  "programmer",
  "architect",
  "analyst",
  "scientist",
  "designer",
  "manager",
  "director",
  "officer",
  "administrator",
  "accountant",
  "auditor",
  "consultant",
  "specialist",
  "coordinator",
  "supervisor",
  "executive",
  "assistant",
  "associate",
  "lead",
  "head",
  "intern",
  "technician",
  "nurse",
  "teacher",
  "lecturer",
  "marketer",
  "recruiter",
  "strategist",
  "writer",
  "editor",
  "researcher",
  "operator",
  "agent",
  "representative",
  "advisor",
  "banker",
  "trader",
  "planner",
];

/**
 * Seniority wording as CVs actually write it, ordered so the strongest signal
 * present in the document wins. These map onto `app.experience_level`.
 */
export const SENIORITY_MARKERS: readonly {
  level: "entry" | "junior" | "mid" | "senior" | "lead" | "executive";
  phrases: readonly string[];
}[] = [
  {
    level: "executive",
    phrases: [
      "chief executive",
      "chief operating",
      "chief financial",
      "chief technology",
      "managing director",
      "vice president",
      "country director",
      "executive director",
    ],
  },
  {
    level: "lead",
    phrases: [
      "head of",
      "team lead",
      "tech lead",
      "engineering manager",
      "principal ",
      "lead engineer",
      "lead developer",
      "department manager",
    ],
  },
  {
    level: "senior",
    phrases: ["senior ", "sr. ", "sr ", "specialist", "supervisor"],
  },
  { level: "mid", phrases: ["mid-level", "mid level", "officer", "associate"] },
  { level: "junior", phrases: ["junior ", "jr. ", "jr ", "assistant"] },
  {
    level: "entry",
    phrases: [
      "intern",
      "internship",
      "graduate trainee",
      "entry level",
      "entry-level",
      "nysc",
      "national youth service",
    ],
  },
];
