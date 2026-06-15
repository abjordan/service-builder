"use client";

import type { ServicePlanMetadata } from "@/lib/service-plan";

interface MetadataCardProps {
  metadata: ServicePlanMetadata;
  onChange: (updated: ServicePlanMetadata) => void;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}

function Field({ label, value, onChange, type = "text", required }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
    </div>
  );
}

export function MetadataCard({ metadata, onChange }: MetadataCardProps) {
  function set(patch: Partial<ServicePlanMetadata>) {
    onChange({ ...metadata, ...patch });
  }

  function setChurch(patch: Partial<ServicePlanMetadata["church"]>) {
    onChange({ ...metadata, church: { ...metadata.church, ...patch } });
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-white">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Metadata
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Service Date"
          value={metadata.serviceDate}
          onChange={(v) => set({ serviceDate: v })}
          type="date"
          required
        />
        <Field
          label="Service Time"
          value={metadata.serviceTime ?? ""}
          onChange={(v) => set({ serviceTime: v || undefined })}
        />
        <div className="col-span-2">
          <Field
            label="Liturgical Day"
            value={metadata.liturgicalDay}
            onChange={(v) => set({ liturgicalDay: v })}
            required
          />
        </div>
        <div className="col-span-2">
          <Field
            label="Church Name"
            value={metadata.church.name}
            onChange={(v) => setChurch({ name: v })}
            required
          />
        </div>
        <div className="col-span-2">
          <Field
            label="Church Address"
            value={metadata.church.address ?? ""}
            onChange={(v) => setChurch({ address: v || undefined })}
          />
        </div>
        <Field
          label="Website"
          value={metadata.church.web ?? ""}
          onChange={(v) => setChurch({ web: v || undefined })}
        />
        <Field
          label="Phone"
          value={metadata.church.phone ?? ""}
          onChange={(v) => setChurch({ phone: v || undefined })}
        />
        <div className="col-span-2">
          <Field
            label="Pastor"
            value={metadata.pastor ?? ""}
            onChange={(v) => set({ pastor: v || undefined })}
          />
        </div>
      </div>
    </div>
  );
}
