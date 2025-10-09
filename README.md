# Single Cell Size Data Explorer

This repository contains a collections of public datasets with single-cell size measurements from different organism with different measurement techniques. 

**This is a work in progress**. We welcome contributions including datasets, improvements to the organization and/or visualization analysis tools. Please feel free to put in a pull request or open an issue if you are interested in helping. 

## Universal format for size data

There are two types of data sets: raw and coarse-grained. In the Coarse-grained data sets the each row represents an individual cell and the columns represent quantities averaged over the cell-cycle. Data is for each paper is grouped into a single csv file. Because the datasets under consideration are not exceedingly large (by standards of modern biological data) we have favored convience over memory efficiency.

The raw data has columns: 

| Column Name | Type | Description [Units] |
|--------|------|-------------|
| size | float | Cell size measurement [units differ between datasets] |
| y | float | Log-normalized size|
| time_units | float | Time measurement [minutes] |
| cell | int | Cell number in lineage |
| lineage | int | Lineage identifier (for mother machine data) |
| experiment | string | Experiment identifier |
| info | string | Additional experiment information |


where $y = \log(\text{size} / \langle\text{size}\rangle)$ with the average being taken over a lineage. cell is the cell number in that lineage, lineage is the lineage if each experiment contains multiple lineages (e.g. mother machine channel) and experiment is the identifier of the experiment. Info contains any additional information about the experiment. 

The raw data has columns: 

| Column Name | Type | Description |
|--------|------|-------------|
| y0 | float | Initial log-normalized size [units differ between datasets] |
| phi | float | Log fold-change in sizeover cell cycle |
| gt | float | Generation time [minutes] |
| cell | int | Cell number in lineage |
| lineage | int | Lineage identifier (for mother machine data) |
| experiment | string | Experiment identifier |
| info | string | Additional experiment information |



## Datasets

### Bacteria 
- **WRB2010:** Wang, P., Robert, L., Pelletier, J., Dang, W. L., Taddei, F., Wright, A., & Jun, S. (2010). Robust growth of *Escherichia coli*. *Current Biology*, 20(12), 1099-1103. [https://doi.org/10.1016/j.cub.2010.04.045](https://doi.org/10.1016/j.cub.2010.04.045)
- **TPP2017:** Tanouchi, Y., Pai, A., Park, H., Huang, S., Buchler, N. E., & You, L. (2017). Long-term growth data of *Escherichia coli* at a single-cell level. *Scientific Data*, 4, 170036. [https://doi.org/10.1038/sdata.2017.36](https://doi.org/10.1038/sdata.2017.36)


### Mammalian cells
- **LKB2025:** Levien, E., Kang, J. H., Biswas, K., Manalis, S. R., Amir, A., & Miettinen, T. P. (2025). Stochasticity in mammalian cell growth rates drives cell-to-cell variability independently of cell size and divisions. *bioRxiv*, 2025.06.18.659700. [https://doi.org/10.1101/2025.06.18.659700](https://doi.org/10.1101/2025.06.18.659700)

### Yeast  [WIP]

### Other references
- Cadart, C., Monnier, S., Grilli, J., Sáez, P. J., Srivastava, N., Attia, R., Terriac, E., Baum, B., Cosentino-Lagomarsino, M., & Piel, M. (2018). Size control in mammalian cells involves modulation of both growth rate and cell cycle duration. *Nature Communications*, 9, 3275. [https://doi.org/10.1038/s41467-018-05393-0](https://doi.org/10.1038/s41467-018-05393-0). This contains multiple datasets [To be added]
