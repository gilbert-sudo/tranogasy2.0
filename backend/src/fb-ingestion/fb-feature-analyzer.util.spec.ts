import {
  computePropertyQualityScore,
  deriveAccessVerification,
  deriveFeatureVerification,
  estimatePropertyArea,
  estimatePropertyPriceAriary,
  extractAgencyFees,
  extractDeterministicFeatures,
  hasKnownElectricitySupply,
  hasKnownWaterSupply,
  mergeGeminiAndDeterministicFeatures,
  preserveDescriptionLayout,
  resolveResidentialRoomDefaults,
} from './fb-feature-analyzer.util';

describe('fb-feature-analyzer.util', () => {
  describe('extractDeterministicFeatures & mergeGeminiAndDeterministicFeatures', () => {
    it('detects terrasse, roofTop, bord de route carAccess+motoAccess, and jirama in Malagasy/French post (Screenshot 1/3)', () => {
      const rawPost = [
        'Trano AMIDY Andoharanofotsy bord de route principal',
        '2 étages + terrasse',
        '200m2 surface totale',
        '100m2 surface bati',
        '3 ch rdc +depot Kely afaka atao usage commercial',
        'grande salle 1 er etage',
        '2 ch 2 em étages',
        'terrasse farany ambony',
        'double douche s wc ✅',
        'misy jiro sy rano ✅',
        'mp ou ☎️0345464167',
      ].join('\n');

      const { features, featureVerification } =
        mergeGeminiAndDeterministicFeatures(
          {
            electricityJirama: true,
            waterPumpSupplyJirama: true,
          },
          rawPost,
        );

      expect(features.roofTop).toBe(true);
      expect(features.balcony).toBe(true);
      expect(features.carAccess).toBe(true);
      expect(features.motoAccess).toBe(true);
      expect(features.electricityJirama).toBe(true);
      expect(features.waterPumpSupplyJirama).toBe(true);
      expect(features.electricityPower).toBe(true);
      expect(features.furnishedProperty).toBe(false);
      expect(featureVerification).toEqual({
        carAccess: 'yes',
        motoAccess: 'yes',
        waterSupply: 'yes',
        electricitySupply: 'yes',
        furnishedProperty: 'no',
      });
    });

    it('detects villa features accurately without false-positive placardKitchen on bedroom placards (Screenshot 2)', () => {
      const rawPost = [
        '🔥 VILLA À VENDRE MAHAZOARIVO AMBOHITSOA 🔥',
        '📐 Superficie: 900m² - TITRÉ & BORNÉ',
        '🚗 Accès voiture - Bien clôturée',
        '',
        '📍 RDC - Rez-de-chaussée:',
        '✔️ 1 Living',
        '✔️ 1 Chambre',
        '✔️ Cuisine',
        '✔️ WC pour visiteur',
        '',
        "À L'ÉTAGE:",
        '3 chambres avec placards, une mezzanine, un WC et une douche.',
        'Elle dispose également d’une dépendance gardien.',
      ].join('\n');

      const { features, featureVerification } =
        mergeGeminiAndDeterministicFeatures({}, rawPost);

      expect(features.carAccess).toBe(true);
      expect(features.motoAccess).toBe(true);
      expect(features.surroundedByWalls).toBe(true);
      expect(features.insideToilet).toBe(true);
      expect(features.guardianHouse).toBe(true);
      expect(features.securitySystem).toBe(true);
      expect(features.placardKitchen).toBe(false);
      // Unmentioned residential water & electricity default to probable JIRAMA ('yes') and unfurnished ('no')
      expect(features.waterPumpSupplyJirama).toBe(true);
      expect(features.electricityJirama).toBe(true);
      expect(features.electricityPower).toBe(true);
      expect(features.furnishedProperty).toBe(false);
      expect(featureVerification).toEqual({
        carAccess: 'yes',
        motoAccess: 'yes',
        waterSupply: 'yes',
        electricitySupply: 'yes',
        furnishedProperty: 'no',
      });
    });

    it('detects parking & Malagasy parking equivalents as parkingSpaceAvailable + carAccess + motoAccess', () => {
      const frRes = mergeGeminiAndDeterministicFeatures(
        {},
        'Appartement T3 Ivandry avec place de parking et cuisine placardée',
      );
      expect(frRes.features.parkingSpaceAvailable).toBe(true);
      expect(frRes.features.carAccess).toBe(true);
      expect(frRes.features.motoAccess).toBe(true);
      expect(frRes.features.placardKitchen).toBe(true);

      const mgRes = mergeGeminiAndDeterministicFeatures(
        {},
        'Trano hofaina eny Ambohibao, tokotany mahazaka fiara 3, misy vovo sy bassin',
      );
      expect(mgRes.features.courtyard).toBe(true);
      expect(mgRes.features.parkingSpaceAvailable).toBe(true);
      expect(mgRes.features.carAccess).toBe(true);
      expect(mgRes.features.motoAccess).toBe(true);
      expect(mgRes.features.waterWellSupply).toBe(true);
      expect(mgRes.features.bassin).toBe(true);
    });

    it('detects standalone "terrasse" / "véranda" / "lavarangana" as balcony', () => {
      const res1 = extractDeterministicFeatures(
        'Bel appartement T2 avec grande terrasse et balcon',
      );
      expect(res1.features.balcony).toBe(true);
      expect(res1.features.roofTop).toBeUndefined();

      const res2 = extractDeterministicFeatures(
        'Trano tsara misy lavarangana sy jardin, douche wc anatiny',
      );
      expect(res2.features.balcony).toBe(true);
      expect(res2.features.garden).toBe(true);
      expect(res2.features.insideToilet).toBe(true);
      expect(res2.features.insideBathroom).toBe(true);
    });

    it('handles explicit negations, moto-only inference when only accès moto is stated, and Malagasy access restrictions accurately', () => {
      const motoOnly = mergeGeminiAndDeterministicFeatures(
        { carAccess: true }, // Gemini hallucinated carAccess=true
        'Trano ahofa Sabotsy Namehana, moto ihany no miditra, tsisy parking, douche wc ivelany',
      );
      expect(motoOnly.features.carAccess).toBe(false);
      expect(motoOnly.features.motoAccess).toBe(true);
      expect(motoOnly.features.parkingSpaceAvailable).toBe(false);
      expect(motoOnly.features.insideToilet).toBe(false);
      expect(motoOnly.features.insideBathroom).toBe(false);
      expect(motoOnly.featureVerification).toEqual({
        carAccess: 'no',
        motoAccess: 'yes',
        waterSupply: 'yes',
        electricitySupply: 'yes',
        furnishedProperty: 'no',
      });

      // When publisher mentions ONLY "accès moto" without mentioning car access -> conclude moto-only (carAccess = 'no')
      const motoMentionedAlone = mergeGeminiAndDeterministicFeatures(
        {},
        'ambany rihana accès moto, mifefy tsara..',
      );
      expect(motoMentionedAlone.features.motoAccess).toBe(true);
      expect(motoMentionedAlone.features.carAccess).toBe(false);
      expect(motoMentionedAlone.features.surroundedByWalls).toBe(true);
      expect(motoMentionedAlone.featureVerification).toEqual({
        carAccess: 'no',
        motoAccess: 'yes',
        waterSupply: 'yes',
        electricitySupply: 'yes',
        furnishedProperty: 'no',
      });

      const pedestrianOnly = mergeGeminiAndDeterministicFeatures(
        {},
        'Chambre à louer Analakely, accès piéton uniquement, pas de parking, non meublée',
      );
      expect(pedestrianOnly.features.carAccess).toBe(false);
      expect(pedestrianOnly.features.motoAccess).toBe(false);
      expect(pedestrianOnly.features.parkingSpaceAvailable).toBe(false);
      expect(pedestrianOnly.features.furnishedProperty).toBe(false);
      expect(pedestrianOnly.featureVerification).toEqual({
        carAccess: 'no',
        motoAccess: 'no',
        waterSupply: 'yes',
        electricitySupply: 'yes',
        furnishedProperty: 'no',
      });
    });

    it('does not infer carAccess from proximity phrases like "akaiky arabe" or "en cours"', () => {
      const res = mergeGeminiAndDeterministicFeatures(
        {},
        'Trano hofaina akaiky arabe, travaux en cours, tsara fijery',
      );
      expect(res.features.carAccess).toBe(false);
      expect(res.features.motoAccess).toBe(false);
      expect(res.features.courtyard).toBe(false);
      expect(res.features.panoramicView).toBe(true);
      expect(res.featureVerification).toEqual({
        carAccess: 'unknown',
        motoAccess: 'unknown',
        waterSupply: 'yes',
        electricitySupply: 'yes',
        furnishedProperty: 'no',
      });
    });

    it('supports deriveAccessVerification on legacy candidates', () => {
      expect(
        deriveAccessVerification({ carAccess: false, motoAccess: false }, 'T3 propre'),
      ).toEqual({ carAccess: 'unknown', motoAccess: 'unknown' });

      expect(
        deriveAccessVerification(
          { carAccess: false, motoAccess: true },
          'accès moto',
          null,
        ),
      ).toEqual({ carAccess: 'no', motoAccess: 'yes' });

      expect(
        deriveAccessVerification({ carAccess: true, motoAccess: false }, ''),
      ).toEqual({ carAccess: 'yes', motoAccess: 'yes' });
    });

    it('detects "maka rano" / "matsaka rano" / external water fetching without confusing am-paompy or jirama electricity with piped indoor water', () => {
      const makaRanoPost = mergeGeminiAndDeterministicFeatures(
        { waterPumpSupplyJirama: true, waterPumpSupply: true }, // Gemini over-inferred indoor water
        'Trano ahofa Ambohidratrimo, misy jiro Jirama, maka rano eny am-paompy fokonolona',
      );
      expect(makaRanoPost.features.waterFetchExternal).toBe(true);
      expect(makaRanoPost.features.electricityJirama).toBe(true);
      expect(makaRanoPost.features.electricityPower).toBe(true);
      expect(makaRanoPost.features.waterPumpSupplyJirama).toBe(false);
      expect(makaRanoPost.features.waterPumpSupply).toBe(false);
      expect(hasKnownWaterSupply(makaRanoPost.features)).toBe(true);

      const matsakaPost = mergeGeminiAndDeterministicFeatures(
        {},
        '1 chambre ahofa Itaosy, matsaka rano akaiky, sans eau chaude',
      );
      expect(matsakaPost.features.waterFetchExternal).toBe(true);
      expect(matsakaPost.features.hotWaterAvailable).toBe(false);

      const noTapWithWell = mergeGeminiAndDeterministicFeatures(
        {},
        'Trano ahofa Ivato, tsy misy rano Jirama ao an-trano fa misy vovo ao an-tokontany',
      );
      expect(noTapWithWell.features.waterWellSupply).toBe(true);
      expect(noTapWithWell.features.waterPumpSupplyJirama).toBe(false);
      expect(noTapWithWell.features.waterFetchExternal).toBe(false);
      expect(hasKnownWaterSupply(noTapWithWell.features)).toBe(true);

      const powerOnlyNoWater = mergeGeminiAndDeterministicFeatures(
        {},
        'Studio propre, misy jiro fa tsy misy rano',
      );
      expect(powerOnlyNoWater.features.electricityJirama).toBe(true);
      expect(powerOnlyNoWater.features.electricityPower).toBe(true);
      expect(powerOnlyNoWater.features.waterPumpSupplyJirama).toBe(false);
      expect(powerOnlyNoWater.features.waterFetchExternal).toBe(false);
      expect(powerOnlyNoWater.featureVerification.electricitySupply).toBe('yes');
      expect(powerOnlyNoWater.featureVerification.waterSupply).toBe('no');

      const noIndoorTap = mergeGeminiAndDeterministicFeatures(
        {},
        'Studio propre, misy jiro fa tsy misy rano ao an-trano',
      );
      expect(noIndoorTap.features.electricityJirama).toBe(true);
      expect(noIndoorTap.features.waterPumpSupplyJirama).toBe(false);
      expect(noIndoorTap.features.waterFetchExternal).toBe(true);
      expect(noIndoorTap.featureVerification.waterSupply).toBe('yes');

      const negatedMakaRano = mergeGeminiAndDeterministicFeatures(
        {},
        'T3 Itaosy, misy rano sy jiro JIRAMA, tsy maka rano intsony',
      );
      expect(negatedMakaRano.features.waterFetchExternal).toBe(false);
      expect(negatedMakaRano.features.waterPumpSupplyJirama).toBe(true);
    });

    it('detects moto-pompe + tank, solar panels (without chauffe-eau solaire false positive), rare utility absence, and furnished verification', () => {
      const motoPompePost = mergeGeminiAndDeterministicFeatures(
        {},
        'Villa à louer Alasora, misy vovo avec moto-pompe sy citerne, entièrement meublée, panneau solaire',
      );
      expect(motoPompePost.features.waterWellSupply).toBe(true);
      expect(motoPompePost.features.waterPumpSupply).toBe(true);
      expect(motoPompePost.features.waterPumpSupplyJirama).toBe(false);
      expect(motoPompePost.features.solarPanels).toBe(true);
      expect(motoPompePost.features.electricityJirama).toBe(false);
      expect(motoPompePost.features.furnishedProperty).toBe(true);
      expect(motoPompePost.featureVerification).toEqual({
        carAccess: 'unknown',
        motoAccess: 'unknown',
        waterSupply: 'yes',
        electricitySupply: 'yes',
        furnishedProperty: 'yes',
      });

      const solarWaterHeaterOnly = mergeGeminiAndDeterministicFeatures(
        {},
        'Maison T4 Ivandry avec chauffe-eau solaire, eau et électricité JIRAMA, misy fanaka',
      );
      expect(solarWaterHeaterOnly.features.hotWaterAvailable).toBe(true);
      expect(solarWaterHeaterOnly.features.solarPanels).toBe(false);
      expect(solarWaterHeaterOnly.features.electricityJirama).toBe(true);
      expect(solarWaterHeaterOnly.features.waterPumpSupplyJirama).toBe(true);
      expect(solarWaterHeaterOnly.features.furnishedProperty).toBe(true);
      expect(solarWaterHeaterOnly.featureVerification).toEqual({
        carAccess: 'unknown',
        motoAccess: 'unknown',
        waterSupply: 'yes',
        electricitySupply: 'yes',
        furnishedProperty: 'yes',
      });

      const offGridSolar = mergeGeminiAndDeterministicFeatures(
        {},
        'Chalet à Ambatomirahavavy, tsy misy jiro JIRAMA fa misy panneau solaire, château d’eau',
      );
      expect(offGridSolar.features.solarPanels).toBe(true);
      expect(offGridSolar.features.electricityJirama).toBe(false);
      expect(offGridSolar.features.waterPumpSupply).toBe(true);
      expect(offGridSolar.features.waterPumpSupplyJirama).toBe(false);
      expect(offGridSolar.featureVerification.electricitySupply).toBe('yes');
      expect(offGridSolar.featureVerification.waterSupply).toBe('yes');

      const rareNoUtilities = mergeGeminiAndDeterministicFeatures(
        {},
        'Trano tsisy jiro sy rano, tsisy fanaka',
      );
      expect(rareNoUtilities.features.waterPumpSupplyJirama).toBe(false);
      expect(rareNoUtilities.features.electricityJirama).toBe(false);
      expect(rareNoUtilities.features.electricityPower).toBe(false);
      expect(rareNoUtilities.features.solarPanels).toBe(false);
      expect(rareNoUtilities.features.furnishedProperty).toBe(false);
      expect(hasKnownWaterSupply(rareNoUtilities.features)).toBe(false);
      expect(hasKnownElectricitySupply(rareNoUtilities.features)).toBe(false);
      expect(rareNoUtilities.featureVerification).toEqual({
        carAccess: 'unknown',
        motoAccess: 'unknown',
        waterSupply: 'no',
        electricitySupply: 'no',
        furnishedProperty: 'no',
      });

      // Commercial properties do not get residential probable JIRAMA pre-fills
      const commercialSilent = mergeGeminiAndDeterministicFeatures(
        {},
        'Box tsena à louer Behoririka, accès moto uniquement',
        undefined,
        { isCommercial: true },
      );
      expect(commercialSilent.features.waterPumpSupplyJirama).toBe(false);
      expect(commercialSilent.features.electricityJirama).toBe(false);
      expect(commercialSilent.features.motoAccess).toBe(true);
      expect(commercialSilent.features.carAccess).toBe(false);

      // Residential silent posts default to JIRAMA water/electricity ('yes') and unfurnished ('no')
      const firstPass = mergeGeminiAndDeterministicFeatures({}, 'T3 calme Antanimena');
      expect(firstPass.features.waterPumpSupplyJirama).toBe(true);
      expect(firstPass.features.electricityJirama).toBe(true);
      expect(firstPass.features.furnishedProperty).toBe(false);
      expect(firstPass.featureVerification.waterSupply).toBe('yes');
      expect(firstPass.featureVerification.electricitySupply).toBe('yes');
      expect(firstPass.featureVerification.furnishedProperty).toBe('no');

      const reanalyzedConfirmed = mergeGeminiAndDeterministicFeatures(
        firstPass.features,
        'T3 calme Antanimena',
        undefined,
        {
          existingVerification: {
            ...firstPass.featureVerification,
            waterSupply: 'yes',
            electricitySupply: 'no',
          },
        },
      );
      expect(reanalyzedConfirmed.featureVerification.waterSupply).toBe('yes');
      expect(reanalyzedConfirmed.features.waterPumpSupplyJirama).toBe(true);
      expect(reanalyzedConfirmed.featureVerification.electricitySupply).toBe('no');
      expect(reanalyzedConfirmed.features.electricityJirama).toBe(false);

      expect(
        deriveFeatureVerification(
          { carAccess: true },
          '',
          { waterSupply: 'no', electricitySupply: 'no', furnishedProperty: 'no' },
        ),
      ).toEqual({
        carAccess: 'yes',
        motoAccess: 'yes',
        waterSupply: 'no',
        electricitySupply: 'no',
        furnishedProperty: 'no',
      });
    });

    it('parses the exact Anosibe Facebook screenshot post (efitra roa+lakozia.dc anatiny.wc ivelany, accès moto, visite 5000ar, caution 50%)', () => {
      const screenshotPost = [
        '👉 Ofany:1M500fmg(300.000ar)',
        '✅ efitra roa+lakozia.dc anatiny.wc ivelany (fosse septique)',
        '✅ ambany rihana accès moto, mifefy tsara..',
        '▶️ eo antokotany ny paompy',
        '▶️ Ankotrany ny jiro',
        '🔍 visite :5000ar',
        '👉 caution :50%',
        '📱0386807242 0337724967(mpanera)',
      ].join('\n');

      const { features, featureVerification } = mergeGeminiAndDeterministicFeatures(
        {},
        screenshotPost,
      );
      expect(features.insideBathroom).toBe(true);
      expect(features.insideToilet).toBe(false);
      expect(features.motoAccess).toBe(true);
      expect(features.carAccess).toBe(false);
      expect(features.surroundedByWalls).toBe(true);
      expect(features.courtyard).toBe(true);
      expect(features.waterPumpSupplyJirama).toBe(true);
      expect(features.electricityJirama).toBe(true);
      expect(features.furnishedProperty).toBe(false);
      expect(featureVerification).toEqual({
        carAccess: 'no',
        motoAccess: 'yes',
        waterSupply: 'yes',
        electricitySupply: 'yes',
        furnishedProperty: 'no',
      });

      const roomsSpec = resolveResidentialRoomDefaults({
        rawText: screenshotPost,
        isCommercial: false,
        houseType: 'appartement',
        rooms: 2,
        livingRoom: null,
        kitchen: null,
        toilet: null,
        bathrooms: null,
        rentAriary: 300000,
      });
      expect(roomsSpec).toEqual({
        rooms: 2,
        livingRoom: 1,
        kitchen: 1,
        toilet: 1,
        bathrooms: 1,
      });

      const fees = extractAgencyFees(screenshotPost, null, 300000);
      expect(fees).toEqual({
        visitFee: 5000,
        cautionPercent: 50,
        cautionAmount: 150000,
        commissionPercent: null,
        commissionAmount: null,
      });

      const estArea = estimatePropertyArea({
        houseType: 'appartement',
        ...roomsSpec,
        area: null,
        features,
      });
      expect(estArea).toBeGreaterThanOrEqual(45);
      expect(estArea).toBeLessThanOrEqual(75);
    });

    it('detects commission ("50%", "1 mois de loyer" => 100%), caution, and droit de visite only when mentioned', () => {
      const oneMonthComm = extractAgencyFees(
        'Appartement T3 Ivandry, loyer 1.200.000 Ar, droit de visite 10.000 Ar, caution 1 mois, commission 1 mois de loyer',
        null,
        1200000,
      );
      expect(oneMonthComm).toEqual({
        visitFee: 10000,
        cautionPercent: 100,
        cautionAmount: 1200000,
        commissionPercent: 100,
        commissionAmount: 1200000,
      });

      const halfMonthComm = extractAgencyFees(
        'Maison à louer Itaosy 400.000 Ar. Visite : 25.000 fmg. Commission : 50%',
        null,
        400000,
      );
      expect(halfMonthComm).toEqual({
        visitFee: 5000,
        cautionPercent: null,
        cautionAmount: null,
        commissionPercent: 50,
        commissionAmount: 200000,
      });

      const silentFees = extractAgencyFees('Trano ahofa Ankadifotsy 500.000 Ar, efitra telo', null, 500000);
      expect(silentFees).toEqual({
        visitFee: null,
        cautionPercent: null,
        cautionAmount: null,
        commissionPercent: null,
        commissionAmount: null,
      });
    });

    it('detects sloppy visit fee, caution, and commission notations (Visite.10.000 ar, dv:5000, Caution.50%, Com:50%)', () => {
      const andranoroScreenshotPost = [
        '1 Living Carrelée',
        'Cuisine placardée',
        '1 chambres Carrelée',
        "Salle d'eau et toilettes intérieur",
        'Avec terrasse',
        'Eau et électricité Indépendant',
        'Commission :50%',
        'Visite.10.000 ar',
        'Contact 034 4915369',
      ].join('\n');

      expect(extractAgencyFees(andranoroScreenshotPost, null, 350000)).toEqual({
        visitFee: 10000,
        cautionPercent: null,
        cautionAmount: null,
        commissionPercent: 50,
        commissionAmount: 175000,
      });

      expect(
        extractAgencyFees('T2 Anosy, dv: 5mil, Caution.50%, Com.50%', null, 400000),
      ).toEqual({
        visitFee: 5000,
        cautionPercent: 50,
        cautionAmount: 200000,
        commissionPercent: 50,
        commissionAmount: 200000,
      });

      expect(
        extractAgencyFees('Villa Ivato, 10.000 ar ny visite\n034 4915369', null, 800000).visitFee,
      ).toBe(10000);

      // Should not swallow phone digits on the next line after "visite 5000"
      expect(
        extractAgencyFees('Visite 5000\n034 4915369', null, 300000).visitFee,
      ).toBe(5000);

      // Should not mistake "visite 2 chambres" or "Visite.gratuite"
      expect(extractAgencyFees('T2 calme, visite 2 chambres possible', null, 300000).visitFee).toBeNull();
      expect(extractAgencyFees('Studio propre, Visite.gratuite, caution 1mois', null, 250000)).toEqual({
        visitFee: 0,
        cautionPercent: 100,
        cautionAmount: 250000,
        commissionPercent: null,
        commissionAmount: null,
      });
    });
  });

  describe('preserveDescriptionLayout', () => {
    it('restores original multi-line layout and spaces when Gemini collapses text into a flat paragraph', () => {
      const raw = [
        '🔥 VILLA À VENDRE MAHAZOARIVO 🔥',
        '  📐 Superficie: 900m²',
        '',
        '📍 RDC:',
        '  ✔️ 1 Living',
        '  ✔️ 1 Chambre',
      ].join('\n');

      const collapsedGemini =
        'Villa à vendre Mahazoarivo d’une superficie de 900m². RDC: 1 Living, 1 Chambre.';

      const result = preserveDescriptionLayout(raw, collapsedGemini);
      expect(result).toBe(raw);
    });

    it('keeps Gemini description when it actually preserves multi-line paragraph structure', () => {
      const raw = [
        'VILLA À VENDRE',
        'Superficie 900m2',
        '',
        'RDC: Living + Chambre',
        'Étage: 3 Chambres',
      ].join('\n');

      const structuredGemini = [
        'Villa à vendre',
        'Superficie : 900 m²',
        '',
        'RDC : Living + Chambre',
        'Étage : 3 Chambres',
      ].join('\n');

      const result = preserveDescriptionLayout(raw, structuredGemini);
      expect(result).toBe(structuredGemini);
    });
  });

  describe('estimatePropertyPriceAriary & computePropertyQualityScore', () => {
    it('estimates realistic Antananarivo rents and sale prices even with zero DB comparables', () => {
      const ivandryVilla = estimatePropertyPriceAriary({
        type: 'rent',
        houseType: 'villa',
        fokontany: 'Ivandry',
        rooms: 4,
        livingRoom: 1,
        kitchen: 1,
        bathrooms: 2,
        toilet: 2,
        features: {
          carAccess: true,
          furnishedProperty: true,
          insideToilet: true,
          insideBathroom: true,
          electricityJirama: true,
          waterPumpSupplyJirama: true,
          garden: true,
        },
        visualCondition: 'new_or_modern',
      });

      const itaosySimple = estimatePropertyPriceAriary({
        type: 'rent',
        houseType: 'appartement',
        fokontany: 'Itaosy',
        rooms: 2,
        livingRoom: 0,
        kitchen: 1,
        bathrooms: 1,
        toilet: 1,
        features: {
          motoAccess: true,
          insideToilet: false,
          insideBathroom: false,
          electricityJirama: true,
          waterFetchExternal: true,
        },
        visualCondition: 'basic_or_worn',
      });

      expect(ivandryVilla.tier).toBe('tier1_premium');
      expect(itaosySimple.tier).toBe('tier3_accessible');
      expect(ivandryVilla.estimatedAmount).toBeGreaterThan(2_000_000);
      expect(itaosySimple.estimatedAmount).toBeLessThan(400_000);
      expect(ivandryVilla.minAmount).toBeLessThan(ivandryVilla.estimatedAmount);
      expect(ivandryVilla.maxAmount).toBeGreaterThan(ivandryVilla.estimatedAmount);
    });

    it('computes holistic qualityScore (1..100) from photos, visual condition, completeness, and freshness', () => {
      const highQuality = computePropertyQualityScore({
        photoCount: 6,
        visualCondition: 'new_or_modern',
        hasExplicitPrice: true,
        hasMatchedCity: true,
        hasCoords: true,
        hasPhones: true,
        rooms: 3,
        livingRoom: 1,
        area: 120,
        descriptionLength: 280,
        features: {
          carAccess: true,
          insideToilet: true,
          insideBathroom: true,
          placardKitchen: true,
          electricityJirama: true,
          waterPumpSupplyJirama: true,
        },
        publishedAt: new Date(),
      });

      const lowQuality = computePropertyQualityScore({
        photoCount: 1,
        visualCondition: 'basic_or_worn',
        hasExplicitPrice: false,
        hasMatchedCity: false,
        hasCoords: false,
        hasPhones: false,
        rooms: 0,
        livingRoom: 0,
        area: 0,
        descriptionLength: 20,
        features: {},
        publishedAt: new Date(Date.now() - 40 * 24 * 3600 * 1000),
      });

      expect(highQuality).toBeGreaterThanOrEqual(80);
      expect(lowQuality).toBeLessThanOrEqual(40);
    });
  });
});
