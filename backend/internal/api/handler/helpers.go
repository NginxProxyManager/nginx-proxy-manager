package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"npm/internal/model"

	"github.com/go-chi/chi"
)

const defaultLimit = 10

func getPageInfoFromRequest(r *http.Request) (model.PageInfo, error) {
	var pageInfo model.PageInfo
	var err error

	pageInfo.FromDate, pageInfo.ToDate, err = getDateRanges(r)
	if err != nil {
		return pageInfo, err
	}

	pageInfo.Offset, pageInfo.Limit, err = getPagination(r)
	if err != nil {
		return pageInfo, err
	}

	pageInfo.Sort = getSortParameter(r)

	return pageInfo, nil
}

func getDateRanges(r *http.Request) (time.Time, time.Time, error) {
	queryValues := r.URL.Query()
	from := queryValues.Get("from")
	fromDate := time.Now().AddDate(0, -1, 0) // 1 month ago by default
	to := queryValues.Get("to")
	toDate := time.Now()

	if from != "" {
		var fromErr error
		fromDate, fromErr = time.Parse(time.RFC3339, from)
		if fromErr != nil {
			return fromDate, toDate, fmt.Errorf("From date is not in correct format: %v", strings.ReplaceAll(time.RFC3339, "Z", "+"))
		}
	}

	if to != "" {
		var toErr error
		toDate, toErr = time.Parse(time.RFC3339, to)
		if toErr != nil {
			return fromDate, toDate, fmt.Errorf("To date is not in correct format: %v", strings.ReplaceAll(time.RFC3339, "Z", "+"))
		}
	}

	return fromDate, toDate, nil
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
		return 0, fmt.Errorf("%v was not supplied in the request", varName)
	} else if varValue == "" {
		return defaultValue, nil
	}

	varInt, intErr := strconv.Atoi(varValue)
	if intErr != nil {
		return 0, fmt.Errorf("%v is not a valid number", varName)
	}

	return varInt, nil
}

func getURLParamInt(r *http.Request, varName string) (int, error) {
	required := true
	defaultValue := 0
	paramStr := chi.URLParam(r, varName)
	var err error
	var paramInt int

	if paramStr == "" && required {
		return 0, fmt.Errorf("%v was not supplied in the request", varName)
	} else if paramStr == "" {
		return defaultValue, nil
	}

	if paramInt, err = strconv.Atoi(paramStr); err != nil {
		return 0, fmt.Errorf("%v is not a valid number", varName)
	}

	return paramInt, nil
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
