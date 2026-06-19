import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PortalLayout from "@/components/portal/PortalLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";

type StepPayload = Record<string, unknown>;

type ApplicationSummary = {
  id: string;
  student_id: string;
  contract_id: string;
  student_application_steps: {
    id: string;
    step_number: number;
    payload: StepPayload | null;
    is_complete: boolean;
  }[];
};

const sanitizeString = (value: unknown) =>
  typeof value === "string" ? value : "";

const StudentApplicationWizardPrototype = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [application, setApplication] = useState<ApplicationSummary | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

  const [personal, setPersonal] = useState({
    first_name: "",
    last_name: "",
    bio: "",
  });

  const [contact, setContact] = useState({
    email: "",
    mobile: "",
    address_line_1: "",
    address_line_2: "",
    address_line_3: "",
    address_line_4: "",
    town: "",
    postcode: "",
  });

  const contactKeys = useMemo(
    () => Object.keys(contact) as (keyof typeof contact)[],
    [contact],
  );

  const loadApplication = async (id: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("student_applications")
      .select(
        `
        id,
        student_id,
        contract_id,
        student_application_steps (*)
      `,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      toast({
        variant: "destructive",
        title: "Unable to load application",
        description: error.message,
      });
      setLoading(false);
      return;
    }

    if (!data) {
      toast({
        variant: "destructive",
        title: "Application not found",
        description: "Return to the portal dashboard and try again.",
      });
      setLoading(false);
      return;
    }

    setApplication(data as ApplicationSummary);
    hydrateFromSteps(data as ApplicationSummary);
    setLoading(false);
  };

  const hydrateFromSteps = (app: ApplicationSummary) => {
    const step1 = app.student_application_steps.find((item) => item.step_number === 1);
    const step2 = app.student_application_steps.find((item) => item.step_number === 2);

    if (step1?.payload) {
      setPersonal({
        first_name: sanitizeString(step1.payload.first_name),
        last_name: sanitizeString(step1.payload.last_name),
        bio: sanitizeString(step1.payload.bio),
      });
    }

    if (step2?.payload) {
      const payload = step2.payload;
      const nextState = { ...contact };
      contactKeys.forEach((key) => {
        const value = sanitizeString(payload[key]);
        nextState[key] = value;
      });
      setContact(nextState);
    }
  };

  useEffect(() => {
    if (!applicationId) {
      setLoading(false);
      return;
    }
    void loadApplication(applicationId);
  }, [applicationId]);

  const saveStep = async (stepNumber: number, payload: StepPayload) => {
    if (!applicationId) return;
    setSaving(true);
    const { error } = await supabase.from("student_application_steps").upsert(
      {
        application_id: applicationId,
        step_number: stepNumber,
        payload,
        is_complete: false,
      },
      { onConflict: "application_id,step_number" },
    );
    setSaving(false);
    if (error) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: error.message,
      });
      return false;
    }
    toast({ title: "Step saved" });
    return true;
  };

  const handleSubmit = async () => {
    if (!applicationId) return;
    setSaving(true);
    const payload = [
      { step: 1, data: personal },
      { step: 2, data: contact },
    ];
    for (const item of payload) {
      const result = await saveStep(item.step, item.data);
      if (!result) {
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    toast({ title: "All steps saved" });
  };

  if (!applicationId) {
    return (
      <PortalLayout title="Wizard Prototype">
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle>Application ID required</CardTitle>
            <CardDescription>
              Append <code>/portal/wizard-prototype/your-application-id</code> to the URL.
            </CardDescription>
          </CardHeader>
        </Card>
      </PortalLayout>
    );
  }

  if (loading) {
    return (
      <PortalLayout title="Wizard Prototype">
        <div className="min-h-[40vh] flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </PortalLayout>
    );
  }

  if (!application) {
    return (
      <PortalLayout title="Wizard Prototype">
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle>Application not found</CardTitle>
            <CardDescription>
              Please return to the portal dashboard and choose another application.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate("/portal")} className="rounded-md uppercase tracking-wide">
              Back to dashboard
            </Button>
          </CardContent>
        </Card>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Wizard Prototype" backLabel="Back">
      <section className="space-y-8">
        <Card className="rounded-3xl border border-border bg-background/80 backdrop-blur shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl font-display uppercase tracking-wide">
              Prototype Workflow
            </CardTitle>
            <CardDescription>
              Compare this simplified flow with the current wizard. Each section requires manual save.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex gap-2">
              {[1, 2].map((step) => (
                <Button
                  key={step}
                  variant={currentStep === step ? "default" : "outline"}
                  onClick={() => setCurrentStep(step)}
                  className="rounded-md uppercase tracking-wide"
                >
                  Step {step}
                </Button>
              ))}
            </div>

            {currentStep === 1 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="first_name">First name</Label>
                  <Input
                    id="first_name"
                    value={personal.first_name}
                    onChange={(event) =>
                      setPersonal((prev) => ({ ...prev, first_name: event.target.value }))
                    }
                    placeholder="First name"
                  />
                </div>
                <div>
                  <Label htmlFor="last_name">Last name</Label>
                  <Input
                    id="last_name"
                    value={personal.last_name}
                    onChange={(event) =>
                      setPersonal((prev) => ({ ...prev, last_name: event.target.value }))
                    }
                    placeholder="Last name"
                  />
                </div>
                <div>
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    value={personal.bio}
                    onChange={(event) =>
                      setPersonal((prev) => ({ ...prev, bio: event.target.value }))
                    }
                    placeholder="Tell us about yourself"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => saveStep(1, personal)}
                    className="rounded-md uppercase tracking-wide"
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Step 1"}
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="contact_email">Email</Label>
                  <Input
                    id="contact_email"
                    value={contact.email}
                    onChange={(event) =>
                      setContact((prev) => ({ ...prev, email: event.target.value }))
                    }
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="contact_mobile">Mobile number</Label>
                  <Input
                    id="contact_mobile"
                    value={contact.mobile}
                    onChange={(event) =>
                      setContact((prev) => ({ ...prev, mobile: event.target.value }))
                    }
                    placeholder="Phone number"
                  />
                </div>
                <div>
                  <Label htmlFor="addr1">Address line 1</Label>
                  <Input
                    id="addr1"
                    value={contact.address_line_1}
                    onChange={(event) =>
                      setContact((prev) => ({ ...prev, address_line_1: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="addr2">Address line 2</Label>
                  <Input
                    id="addr2"
                    value={contact.address_line_2}
                    onChange={(event) =>
                      setContact((prev) => ({ ...prev, address_line_2: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="addr3">Address line 3</Label>
                  <Input
                    id="addr3"
                    value={contact.address_line_3}
                    onChange={(event) =>
                      setContact((prev) => ({ ...prev, address_line_3: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="addr4">Address line 4</Label>
                  <Input
                    id="addr4"
                    value={contact.address_line_4}
                    onChange={(event) =>
                      setContact((prev) => ({ ...prev, address_line_4: event.target.value }))
                    }
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="town">Town / City</Label>
                    <Input
                      id="town"
                      value={contact.town}
                      onChange={(event) =>
                        setContact((prev) => ({ ...prev, town: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="postcode">Postcode</Label>
                    <Input
                      id="postcode"
                      value={contact.postcode}
                      onChange={(event) =>
                        setContact((prev) => ({ ...prev, postcode: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => saveStep(2, contact)}
                    className="rounded-md uppercase tracking-wide"
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Step 2"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="rounded-md uppercase tracking-wide" onClick={() => navigate(-1)}>
            Back
          </Button>
          <Button className="rounded-md uppercase tracking-wide" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save all"}
          </Button>
        </div>
      </section>
    </PortalLayout>
  );
};

export default StudentApplicationWizardPrototype;


