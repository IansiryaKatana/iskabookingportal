import PartnerLayout from "@/components/partner/PartnerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePartner } from "@/hooks/usePartner";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Mail, Phone, Percent, Badge as BadgeIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const PartnerProfile = () => {
  const { data: partner, isLoading } = usePartner();
  const { user } = useAuth();

  return (
    <PartnerLayout title="Profile" subtitle="Your partner account information">
      <div className="space-y-6">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle
              className="text-xl font-display uppercase tracking-wide flex items-center gap-2"
              tooltip="Your partner account details"
              tooltipLabel="About Partner Information"
            >
              <User className="h-5 w-5" />
              Partner Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-64" />
              </div>
            ) : partner ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      Partner Name
                    </div>
                    <p className="text-lg font-semibold">{partner.name}</p>
                  </div>

                  {partner.referral_code && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <BadgeIcon className="h-4 w-4" />
                        Referral Code
                      </div>
                      <Badge variant="outline" className="font-mono text-lg px-3 py-1">
                        {partner.referral_code}
                      </Badge>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Percent className="h-4 w-4" />
                      Commission Rate
                    </div>
                    <p className="text-lg font-semibold">{partner.commission_percentage}%</p>
                  </div>

                  {user?.email && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        Email
                      </div>
                      <p className="text-lg font-semibold">{user.email}</p>
                    </div>
                  )}

                  {partner.contact_phone && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        Contact Phone
                      </div>
                      <p className="text-lg font-semibold">{partner.contact_phone}</p>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <Badge
                      className={
                        partner.is_active
                          ? "bg-green-600 text-white"
                          : "bg-gray-500 text-white"
                      }
                    >
                      {partner.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">No partner information available.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </PartnerLayout>
  );
};

export default PartnerProfile;

