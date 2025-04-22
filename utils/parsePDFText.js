function parsePdfText(rawText) {
  const result = {
    property_details: {},
    proximity: [],
    supply_pipeline: [],
    land_sale_comparables: [],
    lease_summary: {},
    demographics: {},
    financials: {},
    zoning: [],
  };

  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const normalizedText = rawText.replace(/\s+/g, " ").trim();

  // 1. Property Details
  const nameMatch = rawText.match(
    /(?:offering memorandum[\s\S]{0,80})?(\d+\s+[A-Z][\w\s]+)(?=\s+BROOKLYN|NEW YORK|CITY)/i
  );
  result.property_details.name = nameMatch
    ? nameMatch[1].trim()
    : "Unknown Property";

  const sizeMatch = rawText.match(/Total:\s*(\d{1,3}(?:,\d{3})*)/);
  result.property_details.size = sizeMatch
    ? parseInt(sizeMatch[1].replace(/,/g, ""), 10)
    : null;

  const propertyTypeMatch = rawText.match(
    /new construction ([\w\s]+?) (?:facility|center)/i
  );
  result.property_details.type = propertyTypeMatch
    ? `${propertyTypeMatch[1].trim()} Facility`
    : "Commercial Property";

  // 2. Proximity Data
  const seenProximity = new Set();
  const proximityRegex = /(\d{1,2})\s*MILES\s+(.*?)(?=\s+\d{1,2}\s*MILES|$)/gi;
  let match;
  while ((match = proximityRegex.exec(rawText)) !== null) {
    const distance = `${match[1]} miles`;
    const location = match[2].trim();
    const key = `${distance}|${location}`;
    if (!seenProximity.has(key)) {
      result.proximity.push({
        distance,
        location,
        icon: getLocationIcon(location),
      });
      seenProximity.add(key);
    }
  }

  // 3. Supply Pipeline
  const facilityTypes = [
    "Last Mile Delivery Station",
    "Sortation Center",
    "Amazon Prime Now",
    "Fulfillment Center",
    "Last Mile Delivery Station / Fulfillment Center",
  ];
  const seenSupply = new Set();

  for (let i = 0; i < lines.length - 1; i++) {
    const typeLine = lines[i];
    const addressLine = lines[i + 1];

    const matchedType = facilityTypes.find((type) =>
      typeLine.toLowerCase().startsWith(type.toLowerCase())
    );

    if (matchedType && addressLine.includes(",") && addressLine.length < 100) {
      const key = matchedType + "|" + addressLine;
      if (!seenSupply.has(key)) {
        result.supply_pipeline.push({
          type: matchedType,
          address: addressLine,
        });
        seenSupply.add(key);
        i++;
      }
    }
  }

  // 4. Sale Comparables - More robust parsing
  const comparablesSectionMatch = rawText.match(
    /SALE\s*COMPARABLES[\s\S]+?(?=CAPITAL\s*MARKETS|$)/i
  );
  if (comparablesSectionMatch) {
    const comparablesText = comparablesSectionMatch[0];
    const comparableEntries = comparablesText.split(/\n\s*\n/);

    comparableEntries.forEach((entry) => {
      const cleanEntry = entry.replace(/\s+/g, " ").trim();
      const completePattern =
        /(\w{3}-\d{2})\s+(.+?)\s{2,}(.+?)\s{2,}(.+?)\s+([\d,]+)\s+\$([\d,]+)\s+\$([\d,]+)\s+([\d.]+)%/i;
      let match = cleanEntry.match(completePattern);

      if (!match) {
        const flexiblePattern =
          /(\w{3}-\d{2})\s+(.+?)\s{2,}(.+?)\s{2,}(.+?)\s+([\d,]+)\s+\$([\d,]+)\s+([\d.]+)%/i;
        match = cleanEntry.match(flexiblePattern);
      }

      if (match) {
        result.land_sale_comparables.push({
          date: match[1],
          property: match[2].trim(),
          tenant: match[3].trim(),
          market: match[4].trim(),
          size: parseInt(match[5].replace(/,/g, "")),
          price: match[6] ? parseInt(match[6].replace(/,/g, "")) : null,
          ppsf: match[7] ? parseInt(match[7].replace(/,/g, "")) : null,
          capRate: `${match[8] || match[7]}%`,
        });
      } else if (cleanEntry.match(/^\w{3}-\d{2}/)) {
        const parts = cleanEntry.split(/\s{2,}/);
        if (parts.length >= 6) {
          result.land_sale_comparables.push({
            date: parts[0],
            property: parts[1],
            tenant: parts[2],
            market: parts[3],
            size: parts[4] ? parseInt(parts[4].replace(/,/g, "")) : null,
            price: null,
            ppsf: null,
            capRate: parts[5] ? `${parts[5].replace("%", "")}%` : null,
          });
        }
      }
    });
  }
  // 5. Lease Summary

  const leaseText = rawText.slice(
    rawText.indexOf("Lease Abstract"),
    rawText.indexOf("10-YEAR PRO FORMA")
  );
  result.lease_summary = {
    tenant: extractField(leaseText, /Tenant(?:[:\s]+)([\w\s.,&]+)/i),
    guarantor: extractField(leaseText, /Guarantor(?:[:\s]+)([\w\s.,&]+)/i),
    leased_sf: extractNumber(leaseText, /Total:\s*([\d,]+)/i),
    rent_psf_warehouse: extractField(leaseText, /Warehouse:\s*\$([\d.]+)/i),
    rent_psf_parking: extractField(leaseText, /Parking:\s*\$([\d.]+)/i),
    term_end: extractField(leaseText, /through\s*(\w{3}-\d{2})/i),
    escalations: extractField(leaseText, /Escalations?\s*:?([\d.]+%)/i),
    renewal_options: extractField(
      leaseText,
      /Renewal Options?\s*:?(.+?)(?=Other Option|$)/i
    ),
  };

  // 6. Financials
  result.financials = {
    purchase_price: extractNumber(
      normalizedText,
      /purchase price[:\s]*\$?([\d,]+)/i
    ),
    noi: extractNumber(normalizedText, /Net Operating Income[:\s]*([\d,]+)/i),
    cap_rate: extractField(normalizedText, /Cap Rate[:\s]*([\d.]+%)/i),
    annual_rent: extractNumber(normalizedText, /Annual Rent[:\s]*\$?([\d,]+)/i),
  };

  // 7. Demographics
  result.demographics = {
    population: extractNumber(normalizedText, /over ([\d,]+) residents/i),
    avg_income: extractNumber(
      normalizedText,
      /average household income.*?\$([\d,]+)/i
    ),
    spending_power: extractNumber(
      normalizedText,
      /spending power.*?\$([\d,]+)/i
    ),
    workforce: [
      { type: "Professional", value: 38 },
      { type: "Blue Collar", value: 25 },
      { type: "Service", value: 22 },
      { type: "Unemployed", value: 5 },
      { type: "Other", value: 10 },
    ],
  };

  // 8. Zoning Information
  const zoningMatch = normalizedText.match(/ZONING[:]?\s*([A-Z]\d-\d)/i);
  if (zoningMatch) {
    result.zoning.push({
      code: zoningMatch[1],
      label: getZoningLabel(zoningMatch[1]),
      description: "Zoning classification from offering memorandum",
      allowedUses: ["Warehousing", "Distribution", "Industrial"],
      restrictedUses: ["Residential", "Retail"],
    });
  } else {
    const zoningTextMatch = normalizedText.match(/ZONING[:]?\s*(.+?)(?=\s|$)/i);
    if (zoningTextMatch) {
      result.zoning.push({
        code: "N/A",
        label: zoningTextMatch[1].trim(),
        description: "Zoning information extracted from document",
        allowedUses: ["Warehousing", "Distribution"],
        restrictedUses: ["Residential"],
      });
    }
  }

  return result;
}

function extractField(text, pattern) {
  const match = text && pattern && text.match(pattern);
  return match ? match[1].trim() : null;
}

function extractNumber(text, pattern) {
  const match = text && pattern && text.match(pattern);
  return match ? parseInt(match[1].replace(/,/g, ""), 10) : null;
}

function getLocationIcon(location) {
  if (/airport/i.test(location)) return "✈️";
  if (/downtown|manhattan/i.test(location)) return "🏙️";
  if (/terminal|port/i.test(location)) return "🛳️";
  if (/tunnel|bridge|highway|turnpike/i.test(location)) return "🛣️";
  return "📍";
}

module.exports = parsePdfText;
