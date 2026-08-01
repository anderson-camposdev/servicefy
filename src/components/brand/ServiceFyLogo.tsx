import type { SVGProps } from 'react'

interface ServiceFyLogoProps extends Omit<SVGProps<SVGSVGElement>, 'role'> {
  decorative?: boolean
}

/**
 * Marca vetorial oficial do ServiceFY.
 *
 * Uma única silhueta une S e FY. A fronteira quebrada entre amarelo e azul
 * sugere energia e avanço sem depender de gradientes ou efeitos decorativos.
 */
export default function ServiceFyLogo({ decorative = false, ...props }: ServiceFyLogoProps) {
  return (
    <svg
      viewBox="0 0 100 56"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="geometricPrecision"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : 'ServiceFY'}
      aria-hidden={decorative ? true : undefined}
      {...props}
    >
      <rect width="100" height="56" rx="12" fill="#075985" />
      <path
        data-partition="energy-cut"
        d="M12 0H53L43 20H49L38 56H12C5.373 56 0 50.627 0 44V12C0 5.373 5.373 0 12 0Z"
        fill="#F4C542"
      />
      <text
        x="27"
        y="39"
        fill="#071225"
        fontFamily="Hanken Grotesk, Arial, sans-serif"
        fontSize="33"
        fontWeight="850"
        textAnchor="middle"
      >
        S
      </text>
      <text
        x="69.5"
        y="39"
        fill="#FFFFFF"
        fontFamily="Hanken Grotesk, Arial, sans-serif"
        fontSize="29"
        fontWeight="850"
        letterSpacing="-1.4"
        textAnchor="middle"
      >
        FY
      </text>
    </svg>
  )
}
