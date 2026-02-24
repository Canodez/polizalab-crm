export interface PolicyTypeConfig {
  value: string;
  label: string;
  iconName: string;
  color: string;       // Tailwind bg color class for icon circle
  textColor: string;   // Tailwind text color class for icon
  hasRenewal: boolean;
}

export const POLICY_TYPES: PolicyTypeConfig[] = [
  {
    value: 'Seguro de Autos',
    label: 'Seguro de Autos',
    iconName: 'TruckIcon',
    color: 'bg-blue-100',
    textColor: 'text-blue-600',
    hasRenewal: true,
  },
  {
    value: 'Seguro de Vida',
    label: 'Seguro de Vida',
    iconName: 'HeartIcon',
    color: 'bg-rose-100',
    textColor: 'text-rose-600',
    hasRenewal: true,
  },
  {
    value: 'Seguro de Gastos Médicos Mayores',
    label: 'Seguro de Gastos Médicos Mayores',
    iconName: 'BeakerIcon',
    color: 'bg-emerald-100',
    textColor: 'text-emerald-600',
    hasRenewal: true,
  },
  {
    value: 'Seguro de Hogar',
    label: 'Seguro de Hogar',
    iconName: 'HomeIcon',
    color: 'bg-amber-100',
    textColor: 'text-amber-600',
    hasRenewal: true,
  },
  {
    value: 'Seguro Empresarial / PyME',
    label: 'Seguro Empresarial / PyME',
    iconName: 'BuildingOffice2Icon',
    color: 'bg-violet-100',
    textColor: 'text-violet-600',
    hasRenewal: true,
  },
  {
    value: 'Seguro de Responsabilidad Civil',
    label: 'Seguro de Responsabilidad Civil',
    iconName: 'ScaleIcon',
    color: 'bg-zinc-100',
    textColor: 'text-zinc-600',
    hasRenewal: true,
  },
  {
    value: 'Seguro de Viaje',
    label: 'Seguro de Viaje',
    iconName: 'GlobeAltIcon',
    color: 'bg-sky-100',
    textColor: 'text-sky-600',
    hasRenewal: true,
  },
  {
    value: 'Vida permanente',
    label: 'Vida permanente',
    iconName: 'ShieldCheckIcon',
    color: 'bg-pink-100',
    textColor: 'text-pink-600',
    hasRenewal: false,
  },
];

export const POLICY_TYPE_VALUES = POLICY_TYPES.map((t) => t.value);

export function getPolicyTypeConfig(value: string): PolicyTypeConfig | undefined {
  return POLICY_TYPES.find((t) => t.value === value);
}
