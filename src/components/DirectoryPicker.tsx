import { Button } from "./ui/button";
import { FolderPlus } from "lucide-react";

interface DirectoryPickerProps {
  onSelect: (path: string) => void;
}

export function DirectoryPicker({ onSelect }: DirectoryPickerProps) {
  const handleClick = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select a directory to scan for projects",
      });

      if (selected && typeof selected === "string") {
        onSelect(selected);
      }
    } catch (error) {
      console.error("Failed to open directory picker:", error);
    }
  };

  return (
    <Button variant="outline" size="sm" className="gap-2" onClick={handleClick}>
      <FolderPlus className="w-4 h-4" />
      Add Directory
    </Button>
  );
}
