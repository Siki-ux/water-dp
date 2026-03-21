"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Edit2, Loader2, Save } from "lucide-react";
import { useSession } from "next-auth/react";
import { getApiUrl } from "@/lib/utils";
import { toast } from "sonner";

interface Parser {
    uuid: string;
    name: string;
    type: string;
    settings: any;
}

export function ParserEditDialog({ parser }: { parser: Parser }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { data: session } = useSession();

    // State
    const [name, setName] = useState(parser.name);
    // For settings, we'll generic json edit for now, or specific fields if CSV?
    // User asked to "edit those parsers". Since it's generic, JSON edit is safest but less user friendly.
    // However, for CsvParser, we know the fields (delimiter, header_line, etc.).
    // Let's implement specific fields for CSV, JSON for others OR just JSON for all for now (Power User).
    // Given the previous task created fields, let's try to parse settings to JSON string for editing.
    const [settingsJson, setSettingsJson] = useState(JSON.stringify(parser.settings, null, 2));

    const handleSave = async () => {
        if (!session?.accessToken) return;

        setLoading(true);
        try {
            // Validate JSON
            let parsedSettings;
            try {
                parsedSettings = JSON.parse(settingsJson);
            } catch (e) {
                toast.error("Invalid JSON in settings");
                setLoading(false);
                return;
            }

            const res = await fetch(`${getApiUrl()}/sms/parsers/${parser.uuid}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.accessToken}`,
                },
                body: JSON.stringify({
                    name,
                    settings: parsedSettings
                }),
            });

            if (!res.ok) throw new Error("Failed to update parser");

            toast.success("Parser updated successfully");
            setOpen(false);
            router.refresh();
        } catch (error) {
            toast.error("Failed to update parser");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 bg-muted/50 border-border text-[var(--foreground)] hover:bg-muted">
                    <Edit2 className="w-4 h-4" />
                    Edit Parser
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border text-[var(--foreground)] sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Edit Parser</DialogTitle>
                    <DialogDescription>
                        Update configuration for {parser.name}.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="bg-muted/50 border-border text-[var(--foreground)] focus:border-purple-500/50"
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="settings">Settings (JSON)</Label>
                        <Textarea
                            id="settings"
                            value={settingsJson}
                            onChange={(e) => setSettingsJson(e.target.value)}
                            className="bg-muted/50 border-border text-[var(--foreground)] font-mono text-xs focus:border-purple-500/50 min-h-[200px]"
                        />
                        <p className="text-xs text-[var(--foreground)]/40">
                            Edit the raw JSON configuration. Validate format before saving.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading} className="text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-muted/50">
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={loading} className="bg-purple-600 hover:bg-purple-700 text-[var(--foreground)] gap-2">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
