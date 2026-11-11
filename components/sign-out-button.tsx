"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton(props: React.ComponentProps<typeof Button>) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      {...props}
      onClick={async () => {
        await authClient.signOut();
        router.push("/sign-in");
        router.refresh();
      }}
    >
      {props.children ?? "Sign out"}
    </Button>
  );
}
