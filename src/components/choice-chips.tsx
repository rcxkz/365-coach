import { Check } from "lucide-react";

export type ChoiceOption = { value: string; label: string };

/**
 * Tap-to-choose chips over real radio or checkbox inputs. What's chosen
 * reads at a glance: filled, with a tick. What isn't is outlined and
 * quieter. 44px tall, so they suit a thumb.
 */
export function ChoiceChips({
  name,
  options,
  checked,
  multiple = false,
}: {
  name: string;
  options: ChoiceOption[];
  checked: string[];
  multiple?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label key={option.value}>
          <input
            type={multiple ? "checkbox" : "radio"}
            name={name}
            value={option.value}
            defaultChecked={checked.includes(option.value)}
            className="peer sr-only"
          />
          <span className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 border border-input px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/60 peer-checked:border-primary peer-checked:bg-primary peer-checked:font-medium peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring [&>svg]:hidden peer-checked:[&>svg]:block">
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}
