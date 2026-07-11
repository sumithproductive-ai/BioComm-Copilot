import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TherapyProfileForm } from "@/components/therapy-profile-form";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>BioComm Copilot</CardTitle>
          <CardDescription>
            Enter a therapy profile to start a first-pass UC commercialization
            assessment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TherapyProfileForm />
        </CardContent>
      </Card>
    </div>
  );
}
