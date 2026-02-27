import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateMaintenanceRequest } from "@/hooks/useMaintenanceRequests";
import { useMaintenanceOfficers } from "@/hooks/useStaffMembers";
import { useAdminStudios } from "@/hooks/useAdminStudios";
import { useCommunalAreas } from "@/hooks/useCommunalAreas";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface CreateMaintenanceTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TaskType = "studio" | "communal";

const CATEGORIES = [
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "internet_wifi", label: "Internet/WiFi" },
  { value: "furniture", label: "Furniture" },
  { value: "appliance", label: "Appliance" },
  { value: "hvac", label: "HVAC" },
  { value: "bathroom", label: "Bathroom" },
  { value: "kitchen", label: "Kitchen" },
  { value: "other", label: "Other" },
] as const;

const URGENCY_LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "emergency", label: "Emergency" },
] as const;

export const CreateMaintenanceTaskDialog = ({
  open,
  onOpenChange,
}: CreateMaintenanceTaskDialogProps) => {
  const { toast } = useToast();
  const createRequest = useCreateMaintenanceRequest();
  const { data: maintenanceOfficers } = useMaintenanceOfficers();
  const { data: studios } = useAdminStudios();
  const { data: communalAreas } = useCommunalAreas({ isActive: true });

  const [taskType, setTaskType] = useState<TaskType | "">("");
  const [studioId, setStudioId] = useState<string>("");
  const [communalAreaId, setCommunalAreaId] = useState<string>("");
  const [assignedToUserId, setAssignedToUserId] = useState<string>("");
  const [category, setCategory] = useState<string>("other");
  const [urgency, setUrgency] = useState<string>("medium");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!taskType) {
      toast({
        title: "Validation Error",
        description: "Please select Studio or Communal Area",
        variant: "destructive",
      });
      return;
    }

    if (taskType === "studio" && !studioId) {
      toast({
        title: "Validation Error",
        description: "Please select a studio",
        variant: "destructive",
      });
      return;
    }

    if (taskType === "communal" && !communalAreaId) {
      toast({
        title: "Validation Error",
        description: "Please select a communal area",
        variant: "destructive",
      });
      return;
    }

    if (!assignedToUserId) {
      toast({
        title: "Validation Error",
        description: "Please assign a maintenance officer",
        variant: "destructive",
      });
      return;
    }

    if (!title.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a title",
        variant: "destructive",
      });
      return;
    }

    if (!description.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a description",
        variant: "destructive",
      });
      return;
    }

    try {
      await createRequest.mutateAsync({
        student_id: null, // Staff-created tasks have no student
        studio_id: taskType === "studio" ? studioId : undefined,
        communal_area_id: taskType === "communal" ? communalAreaId : undefined,
        request_type: "maintenance",
        category: category as any,
        title: title.trim(),
        description: description.trim(),
        urgency: urgency as any,
        is_staff_created: true,
        assigned_to_user_id: assignedToUserId,
      });

      toast({
        title: "Task Created",
        description: "Maintenance task has been created and assigned successfully.",
      });

      // Reset form
      setTaskType("");
      setStudioId("");
      setCommunalAreaId("");
      setAssignedToUserId("");
      setCategory("other");
      setUrgency("medium");
      setTitle("");
      setDescription("");
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating maintenance task:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create maintenance task",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    if (!createRequest.isPending) {
      setTaskType("");
      setStudioId("");
      setCommunalAreaId("");
      setAssignedToUserId("");
      setCategory("other");
      setUrgency("medium");
      setTitle("");
      setDescription("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Maintenance Task</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Task Type Selector */}
          <div className="space-y-2">
            <Select value={taskType} onValueChange={(value) => {
              setTaskType(value as TaskType);
              // Reset selections when type changes
              setStudioId("");
              setCommunalAreaId("");
            }}>
              <SelectTrigger id="task-type">
                <SelectValue placeholder="Select Studio or Communal Area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="studio">Studio</SelectItem>
                <SelectItem value="communal">Communal Area</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Studio Selection */}
          {taskType === "studio" && (
            <div className="space-y-2">
              <Select value={studioId} onValueChange={setStudioId}>
                <SelectTrigger id="studio">
                  <SelectValue placeholder="Select a studio" />
                </SelectTrigger>
                <SelectContent>
                  {studios?.map((studio) => (
                    <SelectItem key={studio.id} value={studio.id}>
                      {studio.studio_number}
                      {studio.studio_grade && ` - ${studio.studio_grade.name}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Communal Area Selection */}
          {taskType === "communal" && (
            <div className="space-y-2">
              <Select value={communalAreaId} onValueChange={setCommunalAreaId}>
                <SelectTrigger id="communal-area">
                  <SelectValue placeholder="Select a communal area" />
                </SelectTrigger>
                <SelectContent>
                  {communalAreas?.map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.name}
                      {area.location && ` - ${area.location}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Assignment (Required) */}
          <div className="space-y-2">
            <Select value={assignedToUserId} onValueChange={setAssignedToUserId}>
              <SelectTrigger id="assigned-to">
                <SelectValue placeholder="Select a maintenance officer" />
              </SelectTrigger>
              <SelectContent>
                {maintenanceOfficers?.map((officer) => (
                  <SelectItem key={officer.id} value={officer.id}>
                    {officer.first_name} {officer.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Category *" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Urgency */}
          <div className="space-y-2">
            <Select value={urgency} onValueChange={setUrgency}>
              <SelectTrigger id="urgency">
                <SelectValue placeholder="Urgency / Priority *" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">
                  Low – Priority 3 (Non‑urgent, 28 days)
                </SelectItem>
                <SelectItem value="medium">
                  Medium – Priority 3 (Non‑urgent, 28 days)
                </SelectItem>
                <SelectItem value="high">
                  High – Priority 2 (Urgent, 5 working days)
                </SelectItem>
                <SelectItem value="emergency">
                  Emergency – Priority 1 (24 hours)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of the issue"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description of the maintenance task..."
              rows={4}
              required
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={createRequest.isPending}>
              {createRequest.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

