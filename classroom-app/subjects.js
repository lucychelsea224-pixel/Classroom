// =================================================================
// Shared subject list — every page that needs the subject list
// loads this file instead of keeping its own copy, so adding a
// subject (like these two) only ever happens in one place.
// =================================================================
const SUBJECTS = [
  { id: "civic-ed",              name: "Civic Education",       icon: "⚖️" },
  { id: "english",               name: "English",               icon: "📖" },
  { id: "ict",                   name: "ICT",                   icon: "🌐" },
  { id: "mathematics",           name: "Mathematics",           icon: "🧮" },
  { id: "science",               name: "Science",               icon: "🧠" },
  { id: "social-studies",        name: "Social Studies",        icon: "🏠" },
  { id: "verbal-reasoning",      name: "Verbal Reasoning",      icon: "🗣️" },
  { id: "quantitative-reasoning",name: "Quantitative Reasoning",icon: "🔢" }
];

window.SUBJECTS = SUBJECTS;
