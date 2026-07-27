import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

const CARD_CLASS =
  "mt-6 scroll-mt-6 [--card-spacing:1.75rem] rounded-2xl border border-border shadow-[0_1px_2px_rgba(15,31,61,0.04),0_12px_32px_-20px_rgba(15,31,61,0.18)]";

// Every memo section card gets its own single-item Accordion (default open)
// rather than one shared Accordion across all sections — sections are
// independent widgets, not a group where opening one should close another.
// PRD.md's "Collapsible memo sections in the UI for easier navigation"
// acceptance criterion, implemented as an *option* to collapse a dense
// section, not a default-hidden state (nothing hides on first load).
export function CollapsibleSectionCard({
  id,
  title,
  cardClassName,
  children,
}: {
  id: string;
  title: string;
  cardClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className={cn(CARD_CLASS, cardClassName)}>
      <CardContent>
        <Accordion defaultValue={["content"]}>
          <AccordionItem value="content" className="border-b-0">
            <AccordionTrigger className="py-0 hover:no-underline">
              <h2 className="text-[19px] font-bold text-brand-navy">{title}</h2>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-0">{children}</AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
