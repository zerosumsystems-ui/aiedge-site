"""Curated list of ETFs and leveraged products to exclude from BGU studies.

Single source of truth — used by both `study_buyable_gap_up.py` (stand-alone study)
and `build_bgu_page_data.py` (page-data pipeline). Update here, not in either caller.
"""
from __future__ import annotations

ETF_EXCLUSIONS = frozenset({
    # Broad market
    "SPY", "QQQ", "IWM", "DIA", "VTI", "VOO", "VEA", "VWO", "VUG", "VTV", "IVV",
    "VXUS", "BND", "AGG", "VGK", "VPL", "VEU", "EFA", "EEM", "ACWI", "VT",
    # Country / region
    "EWZ", "FXI", "ASHR", "KWEB", "MCHI", "INDA", "EWJ", "EWY", "EWA", "EWU",
    "EWG", "EWQ", "EWC", "EWP", "EWS", "EWT", "EWH", "EZA", "EWI", "EWN",
    "VNM", "EIDO", "EPHE", "EWL", "EWD",
    # Sector
    "XLE", "XLF", "XLK", "XLV", "XLY", "XLP", "XLI", "XLB", "XLU", "XLRE",
    "XLC", "XBI", "IBB", "XOP", "XME", "XHB", "XRT", "ITB", "IYR", "IYE",
    "VNQ", "VGT", "VHT", "VFH", "VCR", "VDC", "VIS", "VAW", "VPU", "VOX",
    "KRE", "KBE", "SOXX", "SMH", "IGV", "FDN", "ARKK", "ARKQ", "ARKG", "ARKW",
    "ARKF", "ARKX", "GEV", "WCBR",
    # Commodity / bonds
    "GLD", "SLV", "IAU", "GDX", "GDXJ", "SIL", "SILJ", "USO", "UCO", "SCO",
    "UNG", "UGA", "BNO", "DBA", "DBC", "PDBC", "TLT", "IEF", "SHY", "BIL",
    "LQD", "HYG", "JNK", "EMB", "TIP", "MBB",
    # Volatility
    "VXX", "UVXY", "VIXY", "SVXY", "VIX", "VXZ",
    # Leveraged 2x / 3x ETFs (bull / bear)
    "TQQQ", "SQQQ", "UPRO", "SPXU", "SPXL", "SPXS", "SOXL", "SOXS",
    "TECL", "TECS", "FAS", "FAZ", "ERX", "ERY", "GUSH", "DRIP",
    "NUGT", "DUST", "JNUG", "JDST", "BOIL", "KOLD", "AGQ", "ZSL",
    "UDOW", "SDOW", "TNA", "TZA", "DPST", "LABU", "LABD",
    "FNGU", "FNGD", "BITX", "BITO", "BITI", "MAXI", "ETHU",
    "TSLL", "TSDD", "TSLZ", "TSLT", "TSLY", "TSLR",
    "NVDU", "NVDS", "NVDL", "NVDX", "NVDY", "NVDD",
    "CONL", "MSTU", "MSTX", "MSTY", "MSTZ",
    "YINN", "YANG", "EDC", "EDZ", "MEXX", "BRZU",
    "BIB", "BIS", "BNKU", "BNKD",
    "AAPU", "AAPD", "GGLL", "GGLS", "AMZU", "AMZD", "MSFU", "MSFD",
    "METU", "METD", "QURE", "FBL", "FBS",
    "TMV", "TMF", "EDV", "ZROZ",
    # Single-stock 2x leveraged
    "PLTU", "PLTD", "COIU", "COID", "ARKU", "ARKD",
    # Inverse / specialty
    "PSQ", "DOG", "RWM", "SH", "SDS", "QID", "TWM", "DXD",
    "ETHT", "ETHD", "BITQ", "BLOK", "BKCH",
    # Misc
    "SPYQ", "SPLG", "SPMD", "SPSM", "MDY", "IJH", "IJR",
    "GLDM", "SLVM", "IAUM", "BAR", "AAAU",
    "VHF", "OARK", "YBIT", "WTID", "WTAI",
    "URAN", "UCL", "TSAT", "SLNHP", "RILYP",
    # Common ETF suffixes / 2x products encountered in the BGU sample
    "WEED", "VTVT", "OCSAW", "NRGD", "ZHDG", "WVVI",
    "TSLI", "TSLP", "RGTU",
    # NASDAQ test tickers — used by market makers to test order flow,
    # not real securities. Bars look real but the prices are arbitrary.
    "ZVZZT", "ZWZZT", "ZXZZT", "ZYZZT", "ZBZZT", "ZJZZT",
})


def is_etf(ticker: str) -> bool:
    """Return True if ticker is in the ETF/leveraged exclusion list."""
    return ticker.upper() in ETF_EXCLUSIONS
