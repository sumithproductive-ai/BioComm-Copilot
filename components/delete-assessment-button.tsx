"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteAssessment } from "@/lib/actions/delete-assessment";

// Memo detail page's own delete entry point — same confirmation pattern as
// components/assessments-table.tsx's DeleteRowButton, but redirects to
// /assessments on success instead of removing a row in place, since
// there's no list here to update.
export function DeleteAssessmentButton({ id, target }: { id: string; target: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            className="rounded-[9px] border-border bg-white px-3 py-1.5 text-sm font-medium text-destructive hover:bg-red-50"
          />
        }
      >
        <Trash2 className="size-4" />
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this assessment?</AlertDialogTitle>
          <AlertDialogDescription>
            {`This permanently deletes the ${target} assessment and everything in it — clinical, competitive, commercial, regulatory, deal comparables, and patent landscape data, citations, and the decision summary. This can't be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                await deleteAssessment(id);
                router.push("/assessments");
              });
            }}
          >
            {isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
