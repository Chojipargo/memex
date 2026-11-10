export type NoteKind = "thought" | "quote" | "question" | "source";

export type Note = {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  tag: string;
  kind: NoteKind;
  updatedAt: string;
  pinned: boolean;
  source?: string;
};

export type TrailNode = {
  id: string;
  noteId: string;
  label: string;
  kind: NoteKind;
  relation: string;
};

export type Trail = {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
  saved: boolean;
  nodes: TrailNode[];
};

export type Association = {
  id: string;
  fromId: string;
  toId: string;
  strength: number;
  hint: string;
};

export type MapNode = {
  id: string;
  noteId: string;
  label: string;
  kind: NoteKind;
  x: number;
  y: number;
};

export type MapEdge = {
  id: string;
  from: string;
  to: string;
  strength: number;
};

export const seedNotes: Note[] = [
  {
    id: "associative-indexing",
    title: "Associative indexing is the essential feature",
    excerpt:
      "Selection by association, rather than indexing, may yet be mechanized.",
    body: "Bush's central move is not storage. It is selection by association. The mind jumps from thought to thought along a web of relationships, and a memex should let us build, name, and revisit those jumps instead of forcing every idea into a hierarchy.",
    tag: "As We May Think",
    kind: "quote",
    updatedAt: "12 min ago",
    pinned: true,
    source: "Vannevar Bush · 1945",
  },
  {
    id: "trail-not-folder",
    title: "A trail is a path, not a folder",
    excerpt:
      "Folders collect. Trails move. The difference is the order in which meaning appears.",
    body: "A folder answers “where does this belong?” A trail answers “what did this lead to next?” The second question is closer to how memory actually works. Trails preserve sequence, detours, and the reason one thought followed another.",
    tag: "Trail-making",
    kind: "thought",
    updatedAt: "38 min ago",
    pinned: true,
  },
  {
    id: "recall-over-storage",
    title: "Design for recall, not storage",
    excerpt:
      "The value of an archive is measured at the moment you need it again.",
    body: "Capture is cheap. Retrieval is the hard part. Every note should carry enough context to become findable from a different direction later: a question it answers, a project it belongs to, a person it changed your mind about.",
    tag: "Product principles",
    kind: "thought",
    updatedAt: "1 hr ago",
    pinned: true,
  },
  {
    id: "interface-disappears",
    title: "The interface should disappear",
    excerpt:
      "Good tools recede until only the thought and its next connection remain.",
    body: "The best knowledge tools do not make you operate them. They make the next useful association feel close. That means fewer modes, less filing, and a surface that responds to intent rather than demanding configuration.",
    tag: "Tools for thought",
    kind: "thought",
    updatedAt: "2 hrs ago",
    pinned: false,
  },
  {
    id: "attention-residues",
    title: "Attention leaves residues",
    excerpt:
      "What you return to is a better signal than what you save.",
    body: "A library is not only a record of what was collected. It is a record of what kept pulling you back. Revisits, highlights, and repeated searches are quiet evidence of which ideas are still alive.",
    tag: "Recall cues",
    kind: "thought",
    updatedAt: "3 hrs ago",
    pinned: false,
  },
  {
    id: "zettelkasten",
    title: "Zettelkasten: think in links",
    excerpt:
      "A note becomes useful when it can answer more than one future question.",
    body: "Niklas Luhmann's slip-box worked because notes were written to connect. Each note was atomic, addressable, and linked into multiple sequences. The system was less a container than a conversation across time.",
    tag: "Method",
    kind: "source",
    updatedAt: "Yesterday",
    pinned: false,
    source: "Niklas Luhmann",
  },
  {
    id: "forgetting-feature",
    title: "Forgetting is a feature",
    excerpt:
      "A memory that surfaces everything surfaces nothing.",
    body: "Bush imagined a machine that could recall every useful connection. The useful word is useful. An associative system needs permission to let the irrelevant recede so the next relevant path can become visible.",
    tag: "Open question",
    kind: "question",
    updatedAt: "Yesterday",
    pinned: false,
  },
  {
    id: "forking-paths",
    title: "The garden of forking paths",
    excerpt:
      "Every trail contains the trails you did not take.",
    body: "Borges gives us a story where all possible outcomes coexist. A memex trail has a similar texture: each saved path is one branch through the library, and the branches not taken remain available as alternative futures.",
    tag: "Literature",
    kind: "source",
    updatedAt: "2 days ago",
    pinned: false,
    source: "Jorge Luis Borges · 1941",
  },
  {
    id: "spaced-repetition",
    title: "Spaced repetition as trail replay",
    excerpt:
      "Revisit the path, not just the fact.",
    body: "Instead of resurfacing isolated cards, a memex could resurface the sequence that made an idea meaningful: the question, the detour, the source, and the conclusion. Replaying the trail rebuilds the context that makes recall possible.",
    tag: "Recall cues",
    kind: "thought",
    updatedAt: "3 days ago",
    pinned: false,
  },
  {
    id: "ambient-capture",
    title: "Ambient capture needs a curator",
    excerpt:
      "Collect everything and you have collected nothing.",
    body: "Always-on capture produces more material than attention can hold. The missing layer is curation: lightweight signals that tell the system what mattered, what changed, and what should be allowed to fade.",
    tag: "Capture",
    kind: "thought",
    updatedAt: "4 days ago",
    pinned: false,
  },
  {
    id: "knowledge-graphs",
    title: "Graphs are only as good as their edges",
    excerpt:
      "The relationship is the unit of meaning.",
    body: "A knowledge graph is not valuable because it has nodes. It is valuable because each edge carries a reason: supports, contradicts, extends, came from, reminds me of. Without the reason, the graph is only a diagram.",
    tag: "Knowledge graphs",
    kind: "thought",
    updatedAt: "5 days ago",
    pinned: false,
  },
];

export const seedTrails: Trail[] = [
  {
    id: "trail-recall",
    title: "The architecture of recall",
    description:
      "From Bush's associative index to a personal practice of replaying idea paths.",
    updatedAt: "12 min ago",
    saved: true,
    nodes: [
      {
        id: "recall-1",
        noteId: "associative-indexing",
        label: "Associative indexing",
        kind: "quote",
        relation: "The founding move",
      },
      {
        id: "recall-2",
        noteId: "trail-not-folder",
        label: "Trails over folders",
        kind: "thought",
        relation: "What it implies for structure",
      },
      {
        id: "recall-3",
        noteId: "spaced-repetition",
        label: "Replay the path",
        kind: "thought",
        relation: "How recall becomes practice",
      },
      {
        id: "recall-4",
        noteId: "forgetting-feature",
        label: "Let the rest recede",
        kind: "question",
        relation: "The tension left open",
      },
    ],
  },
  {
    id: "trail-tools",
    title: "Tools that remember",
    description:
      "A trail through disappearing interfaces, ambient capture, and graphs with reasons.",
    updatedAt: "1 hr ago",
    saved: true,
    nodes: [
      {
        id: "tools-1",
        noteId: "interface-disappears",
        label: "The invisible interface",
        kind: "thought",
        relation: "Start with friction",
      },
      {
        id: "tools-2",
        noteId: "ambient-capture",
        label: "Capture everything?",
        kind: "thought",
        relation: "The obvious answer fails",
      },
      {
        id: "tools-3",
        noteId: "knowledge-graphs",
        label: "Edges carry meaning",
        kind: "thought",
        relation: "What makes a graph useful",
      },
      {
        id: "tools-4",
        noteId: "recall-over-storage",
        label: "Optimize for recall",
        kind: "thought",
        relation: "The design test",
      },
    ],
  },
  {
    id: "trail-paths",
    title: "The garden of forking paths",
    description:
      "Borges, branching memory, and the trails you notice only after taking them.",
    updatedAt: "Yesterday",
    saved: true,
    nodes: [
      {
        id: "paths-1",
        noteId: "forking-paths",
        label: "All outcomes at once",
        kind: "source",
        relation: "The literary image",
      },
      {
        id: "paths-2",
        noteId: "trail-not-folder",
        label: "The path not taken",
        kind: "thought",
        relation: "A working definition",
      },
      {
        id: "paths-3",
        noteId: "attention-residues",
        label: "What keeps pulling",
        kind: "thought",
        relation: "How branches announce themselves",
      },
    ],
  },
  {
    id: "trail-attention",
    title: "Attention residues",
    description:
      "A short trail on revisits, weak signals, and the ideas that stay warm.",
    updatedAt: "3 hrs ago",
    saved: false,
    nodes: [
      {
        id: "attention-1",
        noteId: "attention-residues",
        label: "Revisits as signal",
        kind: "thought",
        relation: "Notice the pull",
      },
      {
        id: "attention-2",
        noteId: "recall-over-storage",
        label: "Retrieval is the product",
        kind: "thought",
        relation: "Turn signal into design",
      },
      {
        id: "attention-3",
        noteId: "spaced-repetition",
        label: "Schedule the return",
        kind: "thought",
        relation: "Make it deliberate",
      },
    ],
  },
];

export const seedAssociations: Association[] = [
  {
    id: "assoc-1",
    fromId: "associative-indexing",
    toId: "zettelkasten",
    strength: 94,
    hint: "Both replace hierarchy with deliberate links.",
  },
  {
    id: "assoc-2",
    fromId: "knowledge-graphs",
    toId: "interface-disappears",
    strength: 88,
    hint: "Structure should emerge from use, not configuration.",
  },
  {
    id: "assoc-3",
    fromId: "spaced-repetition",
    toId: "attention-residues",
    strength: 79,
    hint: "Returning to an idea is itself a signal.",
  },
  {
    id: "assoc-4",
    fromId: "forking-paths",
    toId: "trail-not-folder",
    strength: 73,
    hint: "A saved path always contains its alternatives.",
  },
];

export const mapNodes: MapNode[] = [
  {
    id: "map-bush",
    noteId: "associative-indexing",
    label: "Associative indexing",
    kind: "quote",
    x: 96,
    y: 108,
  },
  {
    id: "map-trail",
    noteId: "trail-not-folder",
    label: "Trails over folders",
    kind: "thought",
    x: 260,
    y: 62,
  },
  {
    id: "map-recall",
    noteId: "recall-over-storage",
    label: "Design for recall",
    kind: "thought",
    x: 412,
    y: 120,
  },
  {
    id: "map-zettel",
    noteId: "zettelkasten",
    label: "Zettelkasten",
    kind: "source",
    x: 556,
    y: 58,
  },
  {
    id: "map-interface",
    noteId: "interface-disappears",
    label: "Invisible interface",
    kind: "thought",
    x: 664,
    y: 150,
  },
  {
    id: "map-attention",
    noteId: "attention-residues",
    label: "Attention residues",
    kind: "thought",
    x: 210,
    y: 238,
  },
  {
    id: "map-spaced",
    noteId: "spaced-repetition",
    label: "Trail replay",
    kind: "thought",
    x: 394,
    y: 246,
  },
  {
    id: "map-forking",
    noteId: "forking-paths",
    label: "Forking paths",
    kind: "source",
    x: 582,
    y: 232,
  },
];

export const mapEdges: MapEdge[] = [
  { id: "edge-1", from: "map-bush", to: "map-trail", strength: 96 },
  { id: "edge-2", from: "map-bush", to: "map-zettel", strength: 94 },
  { id: "edge-3", from: "map-trail", to: "map-recall", strength: 84 },
  { id: "edge-4", from: "map-recall", to: "map-interface", strength: 72 },
  { id: "edge-5", from: "map-zettel", to: "map-interface", strength: 88 },
  { id: "edge-6", from: "map-trail", to: "map-attention", strength: 68 },
  { id: "edge-7", from: "map-recall", to: "map-spaced", strength: 81 },
  { id: "edge-8", from: "map-attention", to: "map-spaced", strength: 79 },
  { id: "edge-9", from: "map-spaced", to: "map-forking", strength: 64 },
  { id: "edge-10", from: "map-interface", to: "map-forking", strength: 59 },
  { id: "edge-11", from: "map-zettel", to: "map-forking", strength: 61 },
];

export const heroPhrases = [
  "What should we write today?",
  "Trace a new trail of thought...",
  "Connect ideas across your library...",
  "Where shall your associative trail lead?",
];

export const promptSuggestions = [
  "Trace Bush's memex",
  "Link today's notes",
  "Summarize my library",
  "Start a new trail",
];

export function noteById(notes: Note[], id: string) {
  return notes.find((note) => note.id === id);
}

export function associationsFor(noteId: string, associations = seedAssociations) {
  return associations.filter(
    (association) =>
      association.fromId === noteId || association.toId === noteId,
  );
}
