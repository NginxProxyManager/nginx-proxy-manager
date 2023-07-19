package handler

import (
	"net/http"
	"strconv"
	"strings"

	"npm/internal/api/context"
	"npm/internal/model"

	"github.com/go-chi/chi/v5"
	"github.com/rotisserie/eris"
)

const defaultLimit = 10

func getPageInfoFromRequest(r *http.Request) (model.PageInfo, error) {
	var pageInfo model.PageInfo
	var err error

	pageInfo.Offset, pageInfo.Limit, err = getPagination(r)
	if err != nil {
		return pageInfo, err
	}

	pageInfo.Sort = getSortParameter(r)

	return pageInfo, nil
}

func getSortParameter(r *http.Request) []model.Sort {
	var sortFields []model.Sort

	queryValues := r.URL.Query()
	sortString := queryValues.Get("sort")
	if sortString == "" {
		return sortFields
	}

	// Split sort fields up in to slice
	sorts := strings.Split(sortString, ",")
	for _, sortItem := range sorts {
		if strings.Contains(sortItem, ".") {
			theseItems := strings.Split(sortItem, ".")

			switch strings.ToLower(theseItems[1]) {
			case "desc":
				fallthrough
			case "descending":
				theseItems[1] = "DESC"
			default:
				theseItems[1] = "ASC"
			}

			sortFields = append(sortFields, model.Sort{
				Field:     theseItems[0],
				Direction: theseItems[1],
			})
		} else {
			sortFields = append(sortFields, model.Sort{
				Field:     sortItem,
				Direction: "ASC",
			})
		}
	}

	return sortFields
}

func getQueryVarInt(r *http.Request, varName string, required bool, defaultValue int) (int, error) {
	queryValues := r.URL.Query()
	varValue := queryValues.Get(varName)

	if varValue == "" && required {
		return 0, eris.Errorf("%v was not supplied in the request", varName)
	} else if varValue == "" {
		return defaultValue, nil
	}

	varInt, intErr := strconv.Atoi(varValue)
	if intErr != nil {
		return 0, eris.Wrapf(intErr, "%v is not a valid number", varName)
	}

	return varInt, nil
}

func getURLParamInt(r *http.Request, varName string) (uint, error) {
	var defaultValue uint = 0

	required := true
	paramStr := chi.URLParam(r, varName)

	if paramStr == "" && required {
		return 0, eris.Errorf("%v was not supplied in the request", varName)
	} else if paramStr == "" {
		return defaultValue, nil
	}

	paramUint, err := strconv.ParseUint(paramStr, 10, 32)
	if err != nil {
		return 0, eris.Wrapf(err, "%v is not a valid number", varName)
	}

	return uint(paramUint), nil
}

func getURLParamString(r *http.Request, varName string) (string, error) {
	required := true
	defaultValue := ""
	paramStr := chi.URLParam(r, varName)

	if paramStr == "" && required {
		return "", eris.Errorf("%v was not supplied in the request", varName)
	} else if paramStr == "" {
		return defaultValue, nil
	}

	return paramStr, nil
}

func getPagination(r *http.Request) (int, int, error) {
	var err error
	offset, err := getQueryVarInt(r, "offset", false, 0)
	if err != nil {
		return 0, 0, err
	}
	limit, err := getQueryVarInt(r, "limit", false, defaultLimit)
	if err != nil {
		return 0, 0, err
	}

	return offset, limit, nil
}

// getExpandFromContext returns the Expansion setting
func getExpandFromContext(r *http.Request) []string {
	expand, ok := r.Context().Value(context.ExpansionCtxKey).([]string)
	if !ok {
		return nil
	}
	return expand
}
