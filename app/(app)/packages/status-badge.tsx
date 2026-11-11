import { Badge } from "@/components/ui/badge";

export function PackageStatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge>Active</Badge>;
  if (status === "retired") return <Badge variant="secondary">Retired</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}
