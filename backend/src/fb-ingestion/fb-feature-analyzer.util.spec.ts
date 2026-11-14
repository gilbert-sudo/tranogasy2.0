import {
  deriveAccessVerification,
  deriveFeatureVerification,
  extractDeterministicFeatures,
  hasKnownElectricitySupply,
  hasKnownWaterSupply,
  mergeGeminiAndDeterministicFeatures,
  preserveDescriptionLayout,
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
      expect(featureVerification).toEqual({
        carAccess: 'yes',
        motoAccess: 'yes',
        waterSupply: 'yes',
        electricitySupply: 'yes',
        furnishedProperty: 'unknown',
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
      // Unmentioned residential water & electricity default to probable JIRAMA while still flagged 'unknown'
      expect(features.waterPumpSupplyJirama).toBe(true);
      expect(features.electricityJirama).toBe(true);
      expect(features.electricityPower).toBe(true);
      expect(featureVerification).toEqual({
        carAccess: 'yes',
        motoAccess: 'yes',
        waterSupply: 'unknown',
        electricitySupply: 'unknown',
        furnishedProperty: 'unknown',
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

    it('handles explicit negations and Malagasy access restrictions accurately', () => {
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
        waterSupply: 'unknown',
        electricitySupply: 'unknown',
        furnishedProperty: 'unknown',
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
        waterSupply: 'unknown',
        electricitySupply: 'unknown',
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
        waterSupply: 'unknown',
        electricitySupply: 'unknown',
        furnishedProperty: 'unknown',
      });
    });

    it('supports deriveAccessVerification on legacy candidates', () => {
      expect(
        deriveAccessVerification({ carAccess: false, motoAccess: false }, 'T3 propre'),
      ).toEqual({ carAccess: 'unknown', motoAccess: 'unknown' });

      expect(
        deriveAccessVerification(
          { carAccess: false, motoAccess: true },
          'moto ihany no miditra',
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

      // Re-analysis preserves unconfirmed status on silent posts vs admin confirmations
      const firstPass = mergeGeminiAndDeterministicFeatures({}, 'T3 calme Antanimena');
      expect(firstPass.features.waterPumpSupplyJirama).toBe(true);
      expect(firstPass.featureVerification.waterSupply).toBe('unknown');

      const reanalyzedStillUnknown = mergeGeminiAndDeterministicFeatures(
        firstPass.features,
        'T3 calme Antanimena',
        undefined,
        { existingVerification: firstPass.featureVerification },
      );
      expect(reanalyzedStillUnknown.featureVerification.waterSupply).toBe('unknown');
      expect(reanalyzedStillUnknown.featureVerification.electricitySupply).toBe('unknown');

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
});
