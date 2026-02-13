include("./processing_functions.jl")

# ========================================================================================
# ========================================================================================
# CurrBiol-20-1099-1103_2010
# ========================================================================================
# ========================================================================================


# Function to process a single file and convert to standard format
function process__currbiol_file_to_standard(filepath,lineage,experiment, info)
    df = CSV.read(filepath, DataFrame,delim=' ')
    
    
    # Create standard format DataFrame
    n_rows = nrow(df)
    
    # Add cell IDs based on division events
    cell_ids = cumsum([1; diff(df.division) .> 0])
    
    # Create new DataFrame with standard columns
    df_standard = DataFrame(
        size = df.length,
        y = zeros(n_rows),  # Will calculate after getting mean
        time_units = df.time,
        cell = cell_ids,
        lineage = fill(lineage, n_rows),
        channel = fill(0, n_rows),  # Set to 0 as requested
        experiment = fill(experiment, n_rows),
        info = fill(info, n_rows)
    )
    
    return df_standard
end

# Crawl through all CurrBiol data
function process_currbiol_data()
    base_path = "./../data/CurrBiol-20-1099-1103_2010"
    all_data = DataFrame[]
  
    
    print("here")
    # Find all experiment directories (like "E. coli MG1655 lexA3")
    for exp_dir in readdir(base_path)
        exp_path = joinpath(base_path, exp_dir)
        if isdir(exp_path)
            println("Processing experiment: $exp_dir")
            
            # Find all date directories (like "20090922")
            for date_dir in readdir(exp_path)
                lineage_counter = 1  # Simple counter for unique lineage IDs
                date_path = joinpath(exp_path, date_dir)
                if isdir(date_path)
                    experiment = date_dir  # Use date as experiment identifier
                    println("  Processing date: $date_dir")
                    
                    # Find all xy directories
                    for xy_dir in readdir(date_path)
                        xy_path = joinpath(date_path, xy_dir)
                        if isdir(xy_path) && startswith(xy_dir, "xy")
                            println("    Processing directory: $xy_dir")
                            
                            # Find all ch*_cell0.dat files
                            for file in readdir(xy_path)
                                if occursin(r"ch(\d+)_cell0\.dat", file)
                                    # Use counter for lineage instead of ch number
                                    lineage = lineage_counter
                                    lineage_counter += 1
                                    
                                    filepath = joinpath(xy_path, file)
                                    println("      Processing file: $file (lineage $lineage)")
                                    
                                    try
                                        df_processed = process__currbiol_file_to_standard(filepath,lineage,exp_dir*"_"*experiment,"")
                                        push!(all_data, df_processed)
                                    catch e
                                        println("        Error processing $file: $e")
                                    end
                                end
                            end
                        end
                    end
                end
            end
        end
    end
    

    combined_data = vcat(all_data...)
    
    # Calculate y = log(size / mean_size) for each lineage
    for exp_group in groupby(combined_data, :experiment)
        mean_size = mean(exp_group.size)
        exp_group.y .= log.(exp_group.size ./ mean_size)
    end
        
    return combined_data

end


# ========================================================================================
# ========================================================================================
# NatSciData-170036-2017
# ========================================================================================
# ========================================================================================


# Function to process a single NatSci file and convert to standard format
function process_natsci_file_to_standard(filepath, lineage, experiment, info)
    # Read with the specific header for NatSci data
    df = CSV.read(filepath, DataFrame, header=string.(["row","div","length","x","z"]))
    
    # Create standard format DataFrame
    n_rows = nrow(df)
    
    # Add cell IDs based on division events (cumulative sum of division column)
    cell_ids = cumsum([1; diff(df.div) .> 0])
    
    # Create new DataFrame with standard columns
    df_standard = DataFrame(
        size = df.length,  # length is the size measurement
        y = zeros(n_rows),  # Will calculate after getting mean
        time_units = df.row,  # row seems to be the time measurement
        cell = cell_ids,
        lineage = fill(lineage, n_rows),
        channel = fill(0, n_rows),  # Set to 0 as requested
        experiment = fill(experiment, n_rows),
        info = fill(info, n_rows)
    )
    
    return df_standard
end

# Process all NatSci data
function process_natsci_data()
    base_path = "./../data/natscidata-170036-2017"
    all_data = DataFrame[]
    lineage_counter = 1  # Simple counter for unique lineage IDs
    
    println("Processing NatSci data...")
    
    # Look for all temperature directories (like MC4100_27C, MC4100_25C, etc.)
    for temp_dir in readdir(base_path)
        temp_path = joinpath(base_path, temp_dir)
        if isdir(temp_path)
            println("Processing temperature condition: $temp_dir")
            experiment = temp_dir  # Use temperature condition as experiment identifier
            
            # Process all files in this temperature directory
            for file in readdir(temp_path)
                if endswith(file, ".txt")
                    lineage = lineage_counter
                    lineage_counter += 1
                    
                    filepath = joinpath(temp_path, file)
                    println("  Processing file: $file (lineage $lineage)")
                    
                    try
                        df_processed = process_natsci_file_to_standard(filepath, lineage, experiment, "natscidata-170036-2017")
                        push!(all_data, df_processed)
                    catch e
                        println("    Error processing $file: $e")
                    end
                end
            end
        end
    end
    
    # Combine all data
    if !isempty(all_data)
        combined_data = vcat(all_data...)
        
        # Calculate y = log(size / mean_size) for each lineage
        for exp_group in groupby(combined_data, :experiment)
            mean_size = mean(exp_group.size)
            exp_group.y .= log.(exp_group.size ./ mean_size)
        end
        
        return combined_data
    else
        return DataFrame()
    end
end