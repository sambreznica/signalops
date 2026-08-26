import { loadKnowledgeDocs } from "@/lib/replay/load";
import { KnowledgeView } from "@/app/ui/knowledge-view";

export default function KnowledgePage() {
  const docs = loadKnowledgeDocs();
  return <KnowledgeView docs={docs} />;
}
