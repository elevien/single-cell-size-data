
function get_d(df_lin)
    df_lin.y = df_lin.y .- df_lin.y[1]
    ds = []
    dsum = 0.0

    for p in unique(df_lin.position)[1:end]
        df_pos = df_lin[df_lin.position .== p, :]

        if p<length(unique(df_lin.position))
            df_pos2 = df_lin[df_lin.position .== p+1, :]
            d = df_pos.y[end] .- df_pos2.y[1]
        else
            d = log(2)
        end
        push!(ds, d.* df_pos.age .+ dsum)
        dsum += d

    end
    d = vcat(ds...)
    return d
end
