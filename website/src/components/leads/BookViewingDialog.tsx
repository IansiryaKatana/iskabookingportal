import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { LeadForm } from "./LeadForm";

interface BookViewingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const BookViewingDialog = ({ open, onOpenChange }: BookViewingDialogProps) => {
  const isMobile = useIsMobile();

  const title = "Book a Viewing";
  const description = "Schedule a visit to see our studios. Choose your preferred date and time below.";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="mb-0 rounded-t-[28px]">
          <DrawerHeader className="text-left px-6 pt-8">
            <DrawerTitle className="text-2xl font-display font-black uppercase tracking-wide">
              {title}
            </DrawerTitle>
            <DrawerDescription className="text-sm text-muted-foreground mt-2">
              {description}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-2 pb-8">
            <LeadForm 
              formType="booking" 
              onSuccess={() => onOpenChange(false)} 
              onCancel={() => onOpenChange(false)} 
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] rounded-[28px] p-8">
        <DialogHeader>
          <DialogTitle className="text-3xl font-display font-black uppercase tracking-wide">
            {title}
          </DialogTitle>
          <DialogDescription className="text-base text-muted-foreground mt-4">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-6">
          <LeadForm 
            formType="booking" 
            onSuccess={() => onOpenChange(false)} 
            onCancel={() => onOpenChange(false)} 
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
