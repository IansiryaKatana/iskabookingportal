import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStudentApplication } from "@/hooks/useStudentApplication";
import { ArrowLeft, User, Mail, Phone, MapPin, Calendar, Building2, CreditCard, FileText, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { formatContractDuration } from "@/utils/contractDuration";
import { Skeleton } from "@/components/ui/skeleton";
import ManualPaymentDialog from "@/components/admin/ManualPaymentDialog";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const StudentDetail = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const { data: application, isLoading } = useStudentApplication(applicationId || "");
  const [manualPaymentOpen, setManualPaymentOpen] = useState(false);

  // Fetch payment schedule
  const { data: paymentSchedule } = useQuery({
    queryKey: ["payment-schedule", applicationId],
    queryFn: async () => {
      if (!applicationId || !application?.contract_id) return null;
      
      const { data, error } = await supabase
        .from("contract_payment_schedule")
        .select("*")
        .eq("contract_id", application.contract_id)
        .order("sequence", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!applicationId && !!application?.contract_id,
  });

  // Fetch manual payments
  const { data: manualPayments } = useQuery({
    queryKey: ["manual-payments", applicationId],
    queryFn: async () => {
      if (!applicationId) return null;
      const { data, error } = await supabase
        .from("manual_payments")
        .select("*")
        .eq("application_id", applicationId)
        .order("payment_date", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!applicationId,
  });

  // Get Step 1 data for personal info
  const step1 = application?.student_application_steps?.find((s) => s.step_number === 1);
  const step1Data = step1?.payload as {
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
    nationality?: string;
    uk_citizen?: string;
  } | undefined;

  // Get Step 2 data for contact info
  const step2 = application?.student_application_steps?.find((s) => s.step_number === 2);
  const step2Data = step2?.payload as {
    email?: string;
    phone?: string;
    address_line_1?: string;
    address_line_2?: string;
    postcode?: string;
    town?: string;
    country?: string;
  } | undefined;

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "—";
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <AdminLayout pageTitle="Student Details" subtitle="View complete student information">
        <div className="space-y-6">
          <Skeleton className="h-10 w-32" />
          <Card className="rounded-3xl">
            <CardContent className="p-6">
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  if (!application) {
    return (
      <AdminLayout pageTitle="Student Details" subtitle="View complete student information">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle>Student Not Found</CardTitle>
            <CardDescription>The requested student could not be found.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/admin/students")} className="rounded-md uppercase tracking-wide">
              Back to Students
            </Button>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageTitle="Student Details" subtitle="View complete student information">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/admin/students")}
            className="rounded-md uppercase tracking-wide gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Students
          </Button>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="uppercase">
              {application.status}
            </Badge>
            <Button
              variant="outline"
              className="rounded-md uppercase tracking-wide gap-2"
              onClick={() => setManualPaymentOpen(true)}
            >
              <CreditCard className="h-4 w-4" />
              Record Payment
            </Button>
            <Button
              variant="outline"
              className="rounded-md uppercase tracking-wide gap-2"
              onClick={() => navigate(`/portal/applications/${application.id}`)}
            >
              <ExternalLink className="h-4 w-4" />
              View Journey
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Personal Information */}
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Full Name</p>
                <p className="font-medium">
                  {step1Data?.first_name} {step1Data?.last_name}
                </p>
              </div>
              {step1Data?.date_of_birth && (
                <div>
                  <p className="text-sm text-muted-foreground">Date of Birth</p>
                  <p className="font-medium">
                    {format(new Date(step1Data.date_of_birth), "d MMM yyyy")}
                  </p>
                </div>
              )}
              {step1Data?.nationality && (
                <div>
                  <p className="text-sm text-muted-foreground">Nationality</p>
                  <p className="font-medium">{step1Data.nationality}</p>
                </div>
              )}
              {step1Data?.uk_citizen && (
                <div>
                  <p className="text-sm text-muted-foreground">UK Citizen</p>
                  <p className="font-medium">{step1Data.uk_citizen}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {step2Data?.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{step2Data.email}</p>
                  </div>
                </div>
              )}
              {step2Data?.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{step2Data.phone}</p>
                  </div>
                </div>
              )}
              {(step2Data?.address_line_1 || step2Data?.address_line_2 || step2Data?.postcode || step2Data?.town) && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <p className="text-sm text-muted-foreground">Address</p>
                    <p className="font-medium">
                      {step2Data.address_line_1}
                      {step2Data.address_line_2 && `, ${step2Data.address_line_2}`}
                      {step2Data.town && `, ${step2Data.town}`}
                      {step2Data.postcode && `, ${step2Data.postcode}`}
                      {step2Data.country && `, ${step2Data.country}`}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contract Information */}
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Contract Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Studio Grade</p>
                <p className="font-medium">{application.contract?.studio_grade?.name || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Contract</p>
                <p className="font-medium">{application.contract?.slug || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Duration</p>
                <p className="font-medium">{formatContractDuration(application.contract)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Start Date</p>
                <p className="font-medium">
                  {application.contract?.contract_start
                    ? format(new Date(application.contract.contract_start), "d MMM yyyy")
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">End Date</p>
                <p className="font-medium">
                  {application.contract?.contract_end
                    ? format(new Date(application.contract.contract_end), "d MMM yyyy")
                    : "—"}
                </p>
              </div>
              {application.assigned_studio && (
                <div>
                  <p className="text-sm text-muted-foreground">Assigned Studio</p>
                  <p className="font-medium">{application.assigned_studio.studio_number || "—"}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Total Contract Value</p>
                <p className="font-medium text-lg">
                  {formatCurrency(application.total_contract_value)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Payment Information */}
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {application.selected_payment_plan_id && (
                <div>
                  <p className="text-sm text-muted-foreground">Selected Payment Plan</p>
                  <p className="font-medium">
                    {application.contract?.contract_payment_plans?.find(
                      (cpp) => cpp.payment_plan_id === application.selected_payment_plan_id,
                    )?.payment_plan?.name || "—"}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Deposit Status</p>
                <p className="font-medium">
                  {application.deposit_payment_intent_id ? (
                    <Badge variant="default" className="uppercase">Paid</Badge>
                  ) : (
                    <Badge variant="outline" className="uppercase">Pending</Badge>
                  )}
                </p>
              </div>
              {paymentSchedule && paymentSchedule.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Payment Schedule</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {paymentSchedule.map((instalment) => (
                      <div key={instalment.id} className="flex items-center justify-between p-2 bg-muted/40 rounded-lg">
                        <div>
                          <p className="text-sm font-medium">
                            Instalment {instalment.instalment_number}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Due: {format(new Date(instalment.due_date), "d MMM yyyy")}
                          </p>
                        </div>
                        <p className="font-medium">{formatCurrency(Number(instalment.amount))}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {manualPayments && manualPayments.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Manual Payments</p>
                  <div className="space-y-2">
                    {manualPayments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between p-2 bg-muted/40 rounded-lg">
                        <div>
                          <p className="text-sm font-medium capitalize">{payment.payment_type}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(payment.payment_date), "d MMM yyyy")} · {payment.payment_method.replace("_", " ")}
                          </p>
                        </div>
                        <p className="font-medium">{formatCurrency(Number(payment.amount))}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Documents */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-xl font-display uppercase tracking-wide flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documents & Agreements
            </CardTitle>
          </CardHeader>
          <CardContent>
            {application.docusign_envelopes && application.docusign_envelopes.length > 0 ? (
              <div className="space-y-3">
                {application.docusign_envelopes.map((envelope) => (
                  <div key={envelope.id} className="flex items-center justify-between p-4 bg-muted/40 rounded-lg">
                    <div>
                      <p className="font-medium capitalize">{envelope.signature_type} Agreement</p>
                      <p className="text-sm text-muted-foreground">
                        Status: <Badge className={`uppercase rounded-md px-2.5 py-0.5 text-xs font-medium ${
                          envelope.status === "completed" 
                            ? "bg-green-500 hover:bg-green-600 text-white" 
                            : envelope.status === "sent"
                            ? "bg-blue-500 hover:bg-blue-600 text-white"
                            : envelope.status === "delivered"
                            ? "bg-purple-500 hover:bg-purple-600 text-white"
                            : "bg-gray-500 hover:bg-gray-600 text-white"
                        }`}>{envelope.status}</Badge>
                      </p>
                    </div>
                    {envelope.envelope_id && (
                      <p className="text-xs text-muted-foreground font-mono">
                        {envelope.envelope_id.substring(0, 20)}...
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No documents available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {applicationId && (
        <ManualPaymentDialog
          open={manualPaymentOpen}
          onOpenChange={setManualPaymentOpen}
          applicationId={applicationId}
        />
      )}
    </AdminLayout>
  );
};

export default StudentDetail;

