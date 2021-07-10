declare module "aircraft_icons" {
  export function getBaseMarker(
    category: string,
    typeDesignator: string | undefined,
    typeDescription: string | null,
    wtc: string | null,
    addrtype: string,
    altitude: number
  ): import("./interfaces").svg_icon;

  export function svgShapeToURI(
    shape: any,
    strokeWidth: number,
    scale: number
  ): import("./interfaces").aircraft_icon;
}
