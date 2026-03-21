export type GoogleAdsAsset = {
  id?: string;
  name?: string;
  type?: string;
  imageAsset?: {
    fileSize?: number | string;
    fullSize?: {
      url?: string;
      heightPixels?: number | string;
      widthPixels?: number | string;
    };
  };
};

export type GoogleAdsCampaign = {
  id?: string;
  name?: string;
};

export type GoogleAdsAdGroup = {
  id?: string;
  name?: string;
};

export type GoogleAdsMetrics = {
  impressions?: number | string;
  clicks?: number | string;
  conversions?: number | string;
  costMicros?: number | string;
};

export type AssetRow = {
  asset?: GoogleAdsAsset;
  campaign?: GoogleAdsCampaign;
  adGroup?: GoogleAdsAdGroup;
  metrics?: GoogleAdsMetrics;
};

export type ResponsiveSearchAdAsset = {
  text?: string;
};

export type ResponsiveSearchAd = {
  headlines?: ResponsiveSearchAdAsset[];
  descriptions?: ResponsiveSearchAdAsset[];
};

export type GoogleAdsAd = {
  id?: string;
  name?: string;
  type?: string;
  finalUrls?: string[];
  responsiveSearchAd?: ResponsiveSearchAd;
};

export type AdCreativeRow = {
  adGroupAd?: {
    ad?: GoogleAdsAd;
    status?: string;
  };
  adGroup?: GoogleAdsAdGroup;
  campaign?: GoogleAdsCampaign;
};

export type KeywordMetrics = {
  avgMonthlySearches?: number | string;
  competition?: string;
  lowTopOfPageBidMicros?: number | string;
  highTopOfPageBidMicros?: number | string;
};

export type KeywordIdeaResult = {
  text?: string;
  keywordIdeaMetrics?: KeywordMetrics;
};

export type KeywordVolumeResult = {
  text?: string;
  keywordMetrics?: KeywordMetrics;
};
