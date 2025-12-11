import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { navSections } from "./AdminLayout";

type SearchableItem = {
  id: string;
  label: string;
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  section: string;
  sectionIcon: React.ComponentType<{ className?: string }>;
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routePermissions?: Record<string, boolean>;
}

export const CommandPalette = ({ open, onOpenChange, routePermissions = {} }: CommandPaletteProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Flatten navSections into searchable items, filtered by permissions
  const searchableItems: SearchableItem[] = useMemo(() => {
    return navSections.flatMap((section) =>
      section.items
        .filter((item) => {
          // Always allow dashboard
          if (item.to === "/admin") return true;
          // Only show route if permission is explicitly true
          // Hide if false or undefined (no record yet)
          const hasPermission = routePermissions[item.to];
          return hasPermission === true;
        })
        .map((item) => ({
          id: item.to,
          label: item.label,
          route: item.to,
          icon: item.icon,
          section: section.label,
          sectionIcon: section.icon,
        }))
    );
  }, [routePermissions]);

  // Group items by section for display
  const groupedItems = searchableItems.reduce(
    (acc, item) => {
      if (!acc[item.section]) {
        acc[item.section] = [];
      }
      acc[item.section].push(item);
      return acc;
    },
    {} as Record<string, SearchableItem[]>
  );

  const handleSelect = (route: string) => {
    navigate(route);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages and actions... (Ctrl+K)" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {Object.entries(groupedItems).map(([sectionName, items]) => (
          <CommandGroup key={sectionName} heading={sectionName}>
            {items.map((item) => {
              const ItemIcon = item.icon;
              const isActive = location.pathname === item.route || 
                (item.route !== "/admin" && location.pathname.startsWith(item.route + "/"));
              
              return (
                <CommandItem
                  key={item.id}
                  value={`${item.label} ${item.route} ${sectionName}`}
                  onSelect={() => handleSelect(item.route)}
                  className="flex items-center gap-3"
                >
                  <ItemIcon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  {isActive && (
                    <span className="text-xs text-muted-foreground">Current</span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
};

