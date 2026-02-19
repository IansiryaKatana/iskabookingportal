import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileText, Handshake, DollarSign, Calendar, Filter, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePartners, useUpdateCommissionStatus } from "@/hooks/usePartners";
import jsPDF from "jspdf";
import "jspdf-autotable";

type CommissionRecord = {
  id: string;
  partner_id: string;
  application_id: string;
  referral_code: string | null;
  commission_percentage: number;
  total_contract_value: number;
  commission_amount: number;
  commission_status: "pending" | "approved" | "paid" | "cancelled";
  paid_at: string | null;
  paid_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  partner: {
    id: string;
    name: string;
    commission_percentage: number;
  };
  application: {
    id: string;
    student_id: string;
    contract: {
      name: string;
      academic_year: {
        name: string;
      };
    } | null;
  } | null;
};

const PartnerCommissions = () => {
  const { toast } = useToast();
  const [selectedPartner, setSelectedPartner] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const { data: partners } = usePartners(true);

  const { data: commissions, isLoading } = useQuery({
    queryKey: ["partner-commissions", selectedPartner, selectedStatus, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("partner_referrals")
        .select(`
          *,
          partner:partners(id, name, commission_percentage),
          application:student_applications(
            id,
            student_id,
            contract:contracts!contract_id(
              name,
              academic_year:academic_years(name)
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (selectedPartner !== "all") {
        query = query.eq("partner_id", selectedPartner);
      }

      if (selectedStatus !== "all") {
        query = query.eq("commission_status", selectedStatus);
      }

      if (startDate) {
        query = query.gte("created_at", `${startDate}T00:00:00`);
      }

      if (endDate) {
        query = query.lte("created_at", `${endDate}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as CommissionRecord[];
    },
  });

  const updateStatus = useUpdateCommissionStatus();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const exportToCSV = () => {
    if (!commissions || commissions.length === 0) {
      toast({
        title: "No data to export",
        description: "There is no commission data available.",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      "Partner Name",
      "Commission %",
      "Contract Value",
      "Commission Amount",
      "Status",
      "Referral Code",
      "Contract",
      "Academic Year",
      "Created At",
      "Paid At",
      "Notes",
    ];

    const rows = commissions.map((commission) => [
      commission.partner?.name || "N/A",
      `${commission.commission_percentage}%`,
      formatCurrency(commission.total_contract_value),
      formatCurrency(commission.commission_amount),
      commission.commission_status,
      commission.referral_code || "N/A",
      commission.application?.contract?.name || "N/A",
      commission.application?.contract?.academic_year?.name || "N/A",
      format(new Date(commission.created_at), "yyyy-MM-dd HH:mm:ss"),
      commission.paid_at ? format(new Date(commission.paid_at), "yyyy-MM-dd HH:mm:ss") : "N/A",
      commission.notes || "N/A",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `partner-commissions-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Report exported",
      description: `Successfully exported ${commissions.length} records to CSV.`,
    });
  };

  const exportToPDF = () => {
    if (!commissions || commissions.length === 0) {
      toast({
        title: "No data to export",
        description: "There is no commission data available.",
        variant: "destructive",
      });
      return;
    }

    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.text("Partner Commission Report", 14, 20);
    doc.setFontSize(12);
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 30);
    
    // Summary
    const totalCommissions = commissions.reduce((sum, c) => sum + c.commission_amount, 0);
    const pendingTotal = commissions
      .filter((c) => c.commission_status === "pending")
      .reduce((sum, c) => sum + c.commission_amount, 0);
    const paidTotal = commissions
      .filter((c) => c.commission_status === "paid")
      .reduce((sum, c) => sum + c.commission_amount, 0);

    doc.setFontSize(10);
    doc.text(`Total Commissions: ${formatCurrency(totalCommissions)}`, 14, 40);
    doc.text(`Pending: ${formatCurrency(pendingTotal)}`, 14, 46);
    doc.text(`Paid: ${formatCurrency(paidTotal)}`, 14, 52);

    // Table data
    const tableData = commissions.map((commission) => [
      commission.partner?.name || "N/A",
      `${commission.commission_percentage}%`,
      formatCurrency(commission.total_contract_value),
      formatCurrency(commission.commission_amount),
      commission.commission_status.toUpperCase(),
      commission.application?.contract?.name || "N/A",
      format(new Date(commission.created_at), "dd MMM yyyy"),
    ]);

    (doc as any).autoTable({
      startY: 58,
      head: [["Partner", "Rate", "Contract Value", "Commission", "Status", "Contract", "Date"]],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 139, 202] },
    });

    doc.save(`partner-commissions-${format(new Date(), "yyyy-MM-dd")}.pdf`);

    toast({
      title: "PDF exported",
      description: `Successfully exported ${commissions.length} records to PDF.`,
    });
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { className: string; label: string }> = {
      pending: { className: "bg-yellow-500 text-white", label: "Pending" },
      approved: { className: "bg-blue-500 text-white", label: "Approved" },
      paid: { className: "bg-green-600 text-white", label: "Paid" },
      cancelled: { className: "bg-red-500 text-white", label: "Cancelled" },
    };
    return config[status] || { className: "bg-gray-500 text-white", label: status };
  };

  const totalCommissions = commissions?.reduce((sum, c) => sum + c.commission_amount, 0) || 0;
  const pendingTotal = commissions?.filter((c) => c.commission_status === "pending").reduce((sum, c) => sum + c.commission_amount, 0) || 0;
  const paidTotal = commissions?.filter((c) => c.commission_status === "paid").reduce((sum, c) => sum + c.commission_amount, 0) || 0;

  return (
    <AdminLayout
      pageTitle="Partner Commissions"
      subtitle="View and manage partner referral commissions"
      mobileActionButton={
        commissions && commissions.length > 0 ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full p-2 h-9 w-9 flex-shrink-0"
              onClick={exportToCSV}
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full p-2 h-9 w-9 flex-shrink-0"
              onClick={exportToPDF}
            >
              <FileText className="h-4 w-4" />
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {/* Filters */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-lg font-display uppercase tracking-wide flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Partner</Label>
                <Select value={selectedPartner} onValueChange={setSelectedPartner}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Partners" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Partners</SelectItem>
                    {partners?.map((partner) => (
                      <SelectItem key={partner.id} value={partner.id}>
                        {partner.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="rounded-3xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Commissions</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(totalCommissions)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(pendingTotal)}</p>
                </div>
                <Calendar className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Paid</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(paidTotal)}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Commissions List */}
        <Card className="rounded-3xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-display uppercase tracking-wide flex items-center gap-2">
                  <Handshake className="h-5 w-5" />
                  Commission Records
                </CardTitle>
                <CardDescription className="mt-1">
                  {isLoading
                    ? "Loading..."
                    : commissions
                      ? `${commissions.length} record${commissions.length !== 1 ? "s" : ""} found`
                      : "No records found"}
                </CardDescription>
              </div>
              {commissions && commissions.length > 0 && (
                <div className="flex gap-2 hidden lg:flex">
                  <Button
                    onClick={exportToCSV}
                    variant="outline"
                    className="rounded-full uppercase tracking-wide gap-2"
                  >
                    <Download className="h-4 w-4" />
                    CSV
                  </Button>
                  <Button
                    onClick={exportToPDF}
                    variant="outline"
                    className="rounded-full uppercase tracking-wide gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    PDF
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : commissions && commissions.length > 0 ? (
              <div className="space-y-4">
                {commissions.map((commission) => {
                  const statusConfig = getStatusBadge(commission.commission_status);
                  return (
                    <Card key={commission.id} className="rounded-2xl">
                      <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3">
                              <h3 className="text-lg font-semibold">
                                {commission.partner?.name || "Unknown Partner"}
                              </h3>
                              <Badge className={statusConfig.className}>
                                {statusConfig.label}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                              <div>
                                <span className="font-medium">Contract Value:</span>{" "}
                                {formatCurrency(commission.total_contract_value)}
                              </div>
                              <div>
                                <span className="font-medium">Commission:</span>{" "}
                                <span className="font-semibold text-primary">
                                  {formatCurrency(commission.commission_amount)}
                                </span>{" "}
                                ({commission.commission_percentage}%)
                              </div>
                              <div>
                                <span className="font-medium">Contract:</span>{" "}
                                {commission.application?.contract?.name || "N/A"}
                              </div>
                            </div>
                            {commission.referral_code && (
                              <div className="text-sm text-muted-foreground">
                                <span className="font-medium">Referral Code:</span> {commission.referral_code}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              Created: {format(new Date(commission.created_at), "dd MMM yyyy HH:mm")}
                              {commission.paid_at && (
                                <span className="ml-4">
                                  Paid: {format(new Date(commission.paid_at), "dd MMM yyyy HH:mm")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            {commission.commission_status === "pending" && (
                              <Button
                                size="sm"
                                className="rounded-full uppercase tracking-wide"
                                onClick={() => {
                                  updateStatus.mutate({
                                    referralId: commission.id,
                                    status: "approved",
                                  });
                                }}
                              >
                                Approve
                              </Button>
                            )}
                            {commission.commission_status === "approved" && (
                              <Button
                                size="sm"
                                className="rounded-full uppercase tracking-wide bg-green-600 hover:bg-green-700"
                                onClick={() => {
                                  updateStatus.mutate({
                                    referralId: commission.id,
                                    status: "paid",
                                  });
                                }}
                              >
                                Mark as Paid
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="rounded-3xl border-dashed">
                <CardHeader>
                  <CardTitle className="text-xl font-display uppercase tracking-wide">
                    No Commissions Found
                  </CardTitle>
                  <CardDescription>
                    There are no commission records matching your filters.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default PartnerCommissions;

