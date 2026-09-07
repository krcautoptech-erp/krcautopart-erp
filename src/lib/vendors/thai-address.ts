import { getAllData } from "thai-data";

export type ThaiAddressOption = {
  district: string;
  postalCode: string;
  province: string;
  subdistrict: string;
};

type ZipCodeData = {
  districtList: Array<{ districtId: string; districtName: string }> | null;
  provinceList: Array<{ provinceName: string }> | null;
  subDistrictList: Array<{
    districtId: string;
    subDistrictName: string;
  }> | null;
  zipCode: string;
};

export type StructuredVendorAddress = {
  building?: string | null;
  country?: string | null;
  district?: string | null;
  floor?: string | null;
  house_no?: string | null;
  postal_code?: string | null;
  province?: string | null;
  road?: string | null;
  subdistrict?: string | null;
};

const rawData = getAllData() as ZipCodeData[];

const addressOptions: ThaiAddressOption[] = rawData.flatMap((entry: ZipCodeData) => {
  const province = entry.provinceList?.[0]?.provinceName ?? "";
  if (!entry.subDistrictList) return [];
  return entry.subDistrictList.map((subdistrict) => {
    const district =
      entry.districtList?.find(
        (item) => item.districtId === subdistrict.districtId,
      )
        ?.districtName ?? "";

    return {
      district,
      postalCode: entry.zipCode,
      province,
      subdistrict: subdistrict.subDistrictName,
    };
  });
});

const provinceList = Array.from(new Set(addressOptions.map((item) => item.province))).sort();

export function getThaiProvinces() {
  return provinceList;
}

export function getThaiDistricts(province: string) {
  return Array.from(
    new Set(
      addressOptions
        .filter((item) => item.province === province)
        .map((item) => item.district),
    ),
  ).sort();
}

export function getThaiSubdistricts(province: string, district: string) {
  return Array.from(
    new Set(
      addressOptions
        .filter((item) => item.province === province && item.district === district)
        .map((item) => item.subdistrict),
    ),
  ).sort();
}

export function getThaiPostalCode(
  province: string,
  district: string,
  subdistrict: string,
) {
  return (
    addressOptions.find(
      (item) =>
        item.province === province &&
        item.district === district &&
        item.subdistrict === subdistrict,
    )?.postalCode ?? ""
  );
}

export function composeVendorAddressLine(address: StructuredVendorAddress) {
  const firstLine = [address.house_no, address.floor, address.building, address.road]
    .map((value) => (value ?? "").trim())
    .filter(Boolean)
    .join(" ");

  const secondLine = [
    address.subdistrict ? `ตำบล${address.subdistrict}` : "",
    address.district ? `อำเภอ${address.district}` : "",
    address.province ? `จังหวัด${address.province}` : "",
    address.postal_code ?? "",
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");

  return [firstLine, secondLine, (address.country ?? "").trim()]
    .filter(Boolean)
    .join(" ");
}
